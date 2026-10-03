// node --test Habilidades/cerrar-jornada/scripts/sync-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    adminMask, advanceLastFullDay, agentTaskText, autoRef, buildSegments, dayWindow, decideAction, entrySegments,
    fingerprint, frozenReason, humanPrompt, isNight, isSyncPrompt, matchFolder, resolveWindow, spread, subtractSegments,
    toArHm, toEntryTimes, turnEvent, windowSegments, windowsToProcess, workdayOf, workedMinutes,
} from "./sync-core.mjs";

const D = "2026-10-05";
const at = (hm, ymd = D) => Date.parse(`${ymd}T${hm}:00-03:00`);
const seg = (a, z) => [at(a), at(z)];
const spans = (segs) => segs.map(([a, z]) => `${toArHm(a)}–${toArHm(z)}`);
/** Eventos cada 5 min de `a` a `z` (actividad continua). */
const every5 = (a, z) => {
    const out = [];
    for (let t = at(a); t <= at(z); t += 300_000) out.push(t);
    return out;
};

const client = (id, name) => ({ id, name });
const JER = client("c-jer", "Illinois Jeremias");
const AGU = client("c-agu", "Illinois Agustin");
const INT = client("c-int", "Interlabs");
const PAP = client("c-pap", "Ricardo Papetti SRL");
const LUC = client("c-luc", "Lucas Loyola");
const project = (id, c, extra = {}) => ({ id, name: id, client: c, is_billable: true, status: "active", ...extra });
const PROJECTS = new Map([
    project("ia-agent", JER), project("gps", JER), project("medidor", AGU), project("easycad", AGU),
    project("endpoints", INT), project("banco", PAP), project("mykimai", LUC, { is_billable: false }),
].map((p) => [p.id, p]));

const cand = (projectId, segments, { autonomous = false } = {}) => ({
    ref: autoRef(projectId, D, autonomous), date: D, project_id: projectId, autonomous, segments,
    firstEvent: segments[0][0], evidence: { prompts: [`${toArHm(segments[0][0])} pedido de ${projectId}`] },
});
const manual = (projectId, start, end, extra = {}) => {
    const p = PROJECTS.get(projectId);
    return {
        id: `m-${projectId}-${start}`, project: { id: p.id, name: p.name }, client: p.client, title: "a mano",
        description: null, start_time: new Date(at(start)).toISOString(), end_time: new Date(at(end)).toISOString(),
        breaks: [], autonomous: false, is_billed: false, external_ref: null, ...extra,
    };
};
const resolve = (candidates, existing = []) =>
    resolveWindow({ window: dayWindow(D), candidates, existing, projects: PROJECTS, now: at("23:59") });
const byRef = (r, projectId, autonomous = false) => r.entries.find((e) => e.ref === autoRef(projectId, D, autonomous));

// ── Tramos y pausas ──────────────────────────────────────────────────────────
test("buildSegments: tras 1 hora sin eventos empieza una pausa; redondeo a 5 min", () => {
    const segs = buildSegments([at("09:02"), at("09:12"), at("10:12"), at("11:13"), at("11:14")]);
    // 09:12→10:12 es 1 hora justa (sigue); 10:12→11:13 son 61 min (pausa).
    assert.deepEqual(spans(segs), ["09:00–10:10", "11:15–11:20"]);
});

test("buildSegments: un evento suelto vale 5 min; --pausa cambia el umbral", () => {
    assert.deepEqual(spans(buildSegments([at("10:00")])), ["10:00–10:05"]);
    assert.deepEqual(spans(buildSegments([at("10:00"), at("10:21"), at("10:23")], 15)), ["10:00–10:05", "10:20–10:25"]);
    assert.deepEqual(spans(buildSegments([at("10:00"), at("10:21"), at("10:23")])), ["10:00–10:25"]);
});

test("toEntryTimes: inicio, fin y las pausas son los huecos entre tramos", () => {
    const t = toEntryTimes([seg("09:00", "10:00"), seg("11:30", "12:00")]);
    assert.equal(t.start_time, "2026-10-05T09:00:00-03:00");
    assert.equal(t.end_time, "2026-10-05T12:00:00-03:00");
    assert.deepEqual(t.breaks, [{ start_time: "2026-10-05T10:00:00-03:00", end_time: "2026-10-05T11:30:00-03:00" }]);
    assert.equal(t.minutes, 90);
});

test("subtractSegments recorta y parte tramos", () => {
    const out = subtractSegments([seg("09:00", "12:00")], [seg("10:00", "10:30"), seg("11:45", "13:00")]);
    assert.deepEqual(spans(out), ["09:00–10:00", "10:30–11:45"]);
});

test("entrySegments: lo trabajado de una entrada cargada, al minuto hacia afuera", () => {
    const e = manual("banco", "09:00", "11:00", {
        start_time: new Date(at("09:00") + 30_000).toISOString(),
        breaks: [{ start_time: new Date(at("10:00") + 20_000).toISOString(), end_time: new Date(at("10:15") + 40_000).toISOString() }],
    });
    assert.deepEqual(spans(entrySegments(e, at("23:00"))), ["09:00–10:01", "10:15–11:00"]);
});

// ── Jornada 07–21 y noche autónoma 21–07 ─────────────────────────────────────
test("isNight: de 21:00 a 07:00 es trabajo autónomo", () => {
    assert.equal(isNight(at("20:59")), false);
    assert.equal(isNight(at("21:00")), true);
    assert.equal(isNight(at("00:30")), true);
    assert.equal(isNight(at("06:59")), true);
    assert.equal(isNight(at("07:00")), false);
});

test("dayWindow y workdayOf: la noche empieza a las 21 y es de la fecha en que empezó", () => {
    const night = dayWindow(D, "night");
    assert.equal(night.start, at("21:00"));
    assert.equal(night.end, at("07:00", "2026-10-06"));
    assert.equal(workdayOf(at("02:00", "2026-10-06")), D);
    assert.equal(workdayOf(at("07:00", "2026-10-06")), "2026-10-06");
});

test("windowSegments: un evento suelto a las 20:58 no invade la noche", () => {
    assert.deepEqual(spans(windowSegments([at("20:30"), at("20:58")], dayWindow(D))), ["20:30–21:00"]);
    assert.deepEqual(spans(windowSegments([at("20:58")], dayWindow(D))), []);
});

test("windowsToProcess: fechas completas (jornada + noche), recién a las 7 del día siguiente", () => {
    const floor = "2026-10-02";
    const w = (o) => windowsToProcess({ floor, ...o }).windows.map((x) => `${x.date} ${x.scope}`);
    // Primera corrida, 03/10 07:05: la fecha 02 completa (su noche terminó a las 07:00).
    assert.deepEqual(w({ nowMs: Date.parse("2026-10-03T07:05:00-03:00") }), ["2026-10-02 day", "2026-10-02 night"]);
    // La app abrió a las 03:00 del 04: la noche del 03 sigue en curso → nada nuevo.
    assert.deepEqual(w({ lastFullDay: "2026-10-02", nowMs: Date.parse("2026-10-04T03:00:00-03:00") }), []);
    // 04/10 07:05 → la fecha 03.
    assert.deepEqual(w({ lastFullDay: "2026-10-02", nowMs: Date.parse("2026-10-04T07:05:00-03:00") }), ["2026-10-03 day", "2026-10-03 night"]);
    // Ya sincronizado: nada (idempotente).
    assert.deepEqual(w({ lastFullDay: "2026-10-03", nowMs: Date.parse("2026-10-04T15:00:00-03:00") }), []);
    // Más de una semana sin correr: tope de 7 fechas y avisa lo salteado.
    const r = windowsToProcess({ floor, lastFullDay: "2026-10-03", nowMs: Date.parse("2026-10-20T08:00:00-03:00") });
    assert.equal(r.windows.length, 14);
    assert.deepEqual(r.skipped, { from: "2026-10-04", to: "2026-10-12" });
});

// ── Superposiciones ──────────────────────────────────────────────────────────
test("Clientes distintos en paralelo: ninguno se recorta y los dos llevan allow_overlap", () => {
    const r = resolve([cand("endpoints", [seg("08:00", "11:00")]), cand("ia-agent", [seg("10:00", "12:00")])]);
    assert.deepEqual(spans(byRef(r, "endpoints").segments), ["08:00–11:00"]);
    assert.deepEqual(spans(byRef(r, "ia-agent").segments), ["10:00–12:00"]);
    assert.equal(byRef(r, "endpoints").allow_overlap, true);
    assert.equal(byRef(r, "ia-agent").allow_overlap, true);
});

test("Jeremías y Agustín son clientes distintos: en paralelo, ninguno se recorta", () => {
    const r = resolve([cand("ia-agent", [seg("09:00", "12:00")]), cand("medidor", [seg("10:00", "11:00")])]);
    assert.equal(workedMinutes(byRef(r, "ia-agent").segments), 180);
    assert.equal(workedMinutes(byRef(r, "medidor").segments), 60);
});

test("Mismo cliente en paralelo: se unifican en una hora continua, en el proyecto con más tiempo", () => {
    const r = resolve([cand("ia-agent", [seg("09:00", "11:00")]), cand("gps", [seg("10:00", "14:00")])]);
    assert.equal(r.entries.length, 1);
    const e = byRef(r, "gps");
    assert.deepEqual(spans(e.segments), ["09:00–14:00"]);
    assert.deepEqual(e.unified.map((u) => u.project_id), ["ia-agent"]);
    assert.match(e.notes[0], /unificada con ia-agent/);
    // La evidencia de los dos queda, marcada con su proyecto.
    assert.deepEqual(e.evidence.prompts, ["10:00 [gps] pedido de gps", "09:00 [ia-agent] pedido de ia-agent"]);
});

test("Mismo cliente sin superponerse: quedan separadas, cada una en su proyecto", () => {
    const r = resolve([cand("medidor", [seg("09:00", "10:00")]), cand("easycad", [seg("15:00", "17:00")])]);
    assert.ok(byRef(r, "medidor"));
    assert.ok(byRef(r, "easycad"));
    assert.equal(byRef(r, "medidor").allow_overlap, false);
});

test("La unificación se encadena (A con B y B con C, del mismo cliente)", () => {
    const projects = new Map(PROJECTS);
    projects.set("flejadora", project("flejadora", AGU));
    const r = resolveWindow({
        window: dayWindow(D),
        candidates: [cand("medidor", [seg("09:00", "10:00")]), cand("easycad", [seg("09:30", "12:00")]), cand("flejadora", [seg("11:30", "13:00")])],
        existing: [], projects, now: at("23:00"),
    });
    assert.equal(r.entries.length, 1);
    assert.deepEqual(spans(r.entries[0].segments), ["09:00–13:00"]);
    assert.equal(r.entries[0].project.id, "easycad");
});

test("Contra una hora cargada a mano de OTRO cliente: en paralelo, no se recorta", () => {
    const r = resolve([cand("ia-agent", [seg("09:00", "12:00")])], [manual("banco", "10:00", "11:00")]);
    assert.deepEqual(spans(byRef(r, "ia-agent").segments), ["09:00–12:00"]);
    assert.equal(byRef(r, "ia-agent").allow_overlap, true);
    assert.equal(r.doubts.length, 0);
});

test("Contra una hora cargada a mano del MISMO cliente (otro proyecto): ese tiempo ya está contado", () => {
    const r = resolve([cand("gps", [seg("09:00", "12:00")])], [manual("ia-agent", "10:00", "11:00")]);
    assert.deepEqual(spans(byRef(r, "gps").segments), ["09:00–10:00", "11:00–12:00"]);
    assert.equal(byRef(r, "gps").allow_overlap, false);
});

test("Menos de 30 minutos trabajados no se registra (después de recortar)", () => {
    const r = resolve([cand("gps", [seg("11:30", "12:20")])], [manual("ia-agent", "09:00", "12:00")]);
    assert.equal(byRef(r, "gps"), undefined);
    assert.match(r.discarded[0].reason, /20 min/);
    assert.equal(r.discarded[0].raw_minutes, 50);
});

test("El mismo proyecto ya cargado a mano: lo que sobra es duda (≥30) o se descarta", () => {
    const corto = resolve([cand("endpoints", [seg("09:00", "12:10")])], [manual("endpoints", "09:00", "12:00")]);
    assert.equal(corto.entries.length, 0);
    assert.match(corto.discarded[0].reason, /ya cargado a mano/);
    const largo = resolve([cand("endpoints", [seg("09:00", "15:00")])], [manual("endpoints", "09:00", "12:00")]);
    assert.equal(largo.entries.length, 0);
    assert.equal(largo.doubts[0].kind, "cargado_a_mano_parcial");
    assert.equal(largo.doubts[0].minutes, 180);
});

test("Lo que igual se recortaría (mismo cliente) no cuenta como 'fuera de lo cargado a mano'", () => {
    const r = resolve(
        [cand("gps", [seg("09:00", "13:00")])],
        [manual("gps", "09:00", "10:00"), manual("ia-agent", "10:00", "12:50")]
    );
    assert.equal(r.doubts.length, 0);
    assert.match(r.discarded[0].reason, /ya cargado a mano/);
});

test("Lo que cargó el propio agente (misma referencia) no es obstáculo", () => {
    const mine = manual("endpoints", "09:00", "12:00", { external_ref: autoRef("endpoints", D, false) });
    const r = resolve([cand("endpoints", [seg("09:00", "13:00")])], [mine]);
    assert.deepEqual(spans(byRef(r, "endpoints").segments), ["09:00–13:00"]);
});

test("Noche autónoma: otra entrada; lo cargado a mano en la jornada no la afecta", () => {
    const night = cand("endpoints", [seg("22:00", "23:30")], { autonomous: true });
    const r = resolveWindow({ window: dayWindow(D, "night"), candidates: [night], existing: [manual("endpoints", "09:00", "11:00")], projects: PROJECTS, now: at("23:59") });
    assert.ok(byRef(r, "endpoints", true));
});

test("Proyecto archivado o inexistente: duda, no carga", () => {
    const projects = new Map(PROJECTS);
    projects.set("viejo", project("viejo", PAP, { status: "archived" }));
    const r = resolveWindow({ window: dayWindow(D), candidates: [cand("viejo", [seg("09:00", "11:00")]), cand("nada", [seg("09:00", "11:00")])], existing: [], projects, now: at("23:00") });
    assert.deepEqual(r.doubts.map((d) => d.kind).sort(), ["proyecto_inactivo", "proyecto_inexistente"]);
});

// ── Lo que el agente ya cargó ────────────────────────────────────────────────
test("decideAction: crear, no recrear lo borrado, no tocar lo editado ni lo facturado, ajustar lo propio", () => {
    const entry = { segments: [seg("09:00", "10:00"), seg("10:30", "12:00")] };
    const current = manual("endpoints", "09:00", "12:00", {
        breaks: [{ start_time: new Date(at("10:00")).toISOString(), end_time: new Date(at("10:30")).toISOString() }],
    });
    const rec = { fingerprint: fingerprint(current) };
    assert.equal(decideAction(entry, undefined, undefined).action, "create");
    assert.match(decideAction(entry, undefined, rec).reason, /borraste/);
    assert.equal(decideAction(entry, current, rec).action, "noop");
    assert.equal(decideAction(entry, { ...current, is_billed: true }, rec).action, "noop");

    const longer = { segments: [seg("09:00", "10:00"), seg("10:30", "13:00")] };
    assert.match(decideAction(longer, { ...current, is_billed: true }, rec).reason, /facturada/);
    assert.equal(decideAction(longer, current, rec).action, "update");
    assert.match(decideAction(longer, { ...current, title: "Otro título" }, rec).reason, /editaste/);
    assert.equal(decideAction(longer, current, undefined).action, "skip");
});

// ── Carpetas y marca del agente ──────────────────────────────────────────────
test("matchFolder: gana la ruta más específica; cubre worktrees; ignorar y solo_esta_carpeta", () => {
    const map = {
        "C:/Work/1-Illinois/HermesAgent": { project_id: "ia-agent" },
        "C:/Work/2-Interlabs": { project_id: "endpoints" },
        "C:/Work/2-Interlabs/Personal": { ignorar: true },
        "C:/Users/yo": { ignorar: true, solo_esta_carpeta: true },
    };
    assert.equal(matchFolder(map, "C:\\Work\\1-Illinois\\HermesAgent\\.claude\\worktrees\\x").entry.project_id, "ia-agent");
    assert.equal(matchFolder(map, "C:\\Work\\2-Interlabs\\FinalVersion").entry.project_id, "endpoints");
    assert.equal(matchFolder(map, "C:\\Work\\2-Interlabs\\Personal\\algo").entry.ignorar, true);
    assert.equal(matchFolder(map, "C:\\Users\\yo").entry.ignorar, true);
    assert.equal(matchFolder(map, "C:\\Users\\yo\\Otra"), null);
    // Un worktree fuera del repo se resuelve por la raíz del repo.
    assert.equal(matchFolder(map, "D:\\tmp\\wt", "C:\\Work\\1-Illinois\\HermesAgent").entry.project_id, "ia-agent");
});

test("isSyncPrompt: la marca tiene que abrir una línea", () => {
    assert.equal(isSyncPrompt("[mykimai-sync] Agente de horas"), true);
    assert.equal(isSyncPrompt("<scheduled-task name=\"x\">\nThis is an automated run.\n\n[mykimai-sync] Corrida"), true);
    assert.equal(isSyncPrompt("hablando de [mykimai-sync] en el medio"), false);
});

test("agentTaskText: el encargo real del subagente, sin el arnés de los workflows", () => {
    assert.equal(agentTaskText("Revisá el módulo de compras"), "Revisá el módulo de compras");
    assert.equal(agentTaskText("[Workflow harness — user request] The harness relays…:\n  otro pedido del usuario"), null);
    assert.equal(agentTaskText("[Workflow harness — computed task] The computed task text follows:\n  Contexto: MyKimai\n  y más"), "Contexto: MyKimai y más");
});

// ── Lo que no es trabajo para el cliente ─────────────────────────────────────
const userMsg = (text, extra = {}) => ({ type: "user", message: { content: [{ type: "text", text }] }, ...extra });
const toolResult = () => ({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } });
const assistant = (...tools) => ({ type: "assistant", message: { content: tools.length ? tools.map(([name, input]) => ({ type: "tool_use", name, input })) : [{ type: "text", text: "listo" }] } });
const mask = (entries) => adminMask(entries.map(turnEvent));

test("adminMask: el turno que abre el aviso de una duda (otra sesión) no es trabajo", () => {
    const m = mask([
        userMsg("arreglá el bot"), assistant(["Bash", { command: "npm test" }]), toolResult(), assistant(),
        userMsg("<cross-session-message from=\"Reparto\">[Agente de horas de MyKimai] duda…"), assistant(),
        userMsg("seguí con el bot"), assistant(["Edit", { file_path: "bot.ts" }]),
    ]);
    assert.deepEqual(m, [false, false, false, false, true, true, false, false]);
});

test("adminMask: resolver una duda o cerrar la jornada no es trabajo; lo previo del turno sí", () => {
    const resolver = mask([
        userMsg("ponelo en IA Agent"), assistant(["Edit", { file_path: "C:\\Users\\loyol\\.mykimai\\proyectos.json" }]), toolResult(),
        assistant(["Bash", { command: "node C:/Users/loyol/.claude/skills/cerrar-jornada/scripts/sync.mjs plan --date 2026-10-05" }]),
    ]);
    assert.deepEqual(resolver, [true, true, true, true]);
    const mezclado = mask([
        userMsg("terminá el bot y cerrá la jornada"), assistant(["Edit", { file_path: "bot.ts" }]), toolResult(),
        assistant(["mcp__mykimai__create_time_entry", { title: "x" }]), toolResult(), assistant(),
    ]);
    assert.deepEqual(mezclado, [false, false, false, true, true, true]);
    // Desarrollar el agente (editar su código) es trabajo, no administración de horas.
    const desarrollo = mask([
        userMsg("agregá el modo simular"), assistant(["Edit", { file_path: "C:/repo/Habilidades/cerrar-jornada/scripts/sync.mjs" }]), toolResult(),
    ]);
    assert.deepEqual(desarrollo, [false, false, false]);
});

test("humanPrompt: los mensajes meta (cuerpos de skills) y los avisos entre sesiones no son pedidos de Lucas", () => {
    assert.equal(humanPrompt(userMsg("Generá el handoff…", { isMeta: true })), null);
    assert.equal(humanPrompt(userMsg("[Cross-session delivery notice] held")), null);
    assert.equal(humanPrompt(userMsg("arreglá el bot")), "arreglá el bot");
});

test("Un timer en curso o una hora desmedida no recortan nada: quedan como duda", () => {
    const timer = manual("gps", "08:00", "08:00", { end_time: null });
    const larga = manual("ia-agent", "00:00", "23:00");
    const r = resolve([cand("ia-agent", [seg("09:00", "12:00")]), cand("gps", [seg("13:00", "15:00")])], [timer, larga]);
    assert.equal(workedMinutes(byRef(r, "ia-agent").segments), 180);
    assert.equal(workedMinutes(byRef(r, "gps").segments), 120);
    assert.deepEqual(r.doubts.map((d) => d.kind).sort(), ["hora_desmedida", "hora_en_curso"]);
});

test("frozenReason: facturada, editada, de origen desconocido o borrada; si no, se puede ajustar", () => {
    const current = manual("endpoints", "09:00", "12:00");
    const rec = { fingerprint: fingerprint(current) };
    assert.equal(frozenReason(current, rec), null);
    assert.match(frozenReason({ ...current, is_billed: true }, rec), /facturada/);
    assert.match(frozenReason({ ...current, description: "otra" }, rec), /editaste/);
    assert.match(frozenReason(current, undefined), /no la registró/);
    assert.match(frozenReason(undefined, rec), /borraste/);
    assert.equal(frozenReason(undefined, undefined), null);
});

test("advanceLastFullDay: avanza de a una fecha contigua, sin saltear ni pasar errores reintentables", () => {
    const floor = "2026-10-02";
    assert.equal(advanceLastFullDay({ floor, completeDates: ["2026-10-02"] }), "2026-10-02");
    assert.equal(advanceLastFullDay({ lastFullDay: "2026-10-03", floor, completeDates: ["2026-10-04", "2026-10-05"] }), "2026-10-05");
    // Un plan con un hueco (falta el 04) no saltea.
    assert.equal(advanceLastFullDay({ lastFullDay: "2026-10-03", floor, completeDates: ["2026-10-05"] }), "2026-10-03");
    // Un error reintentable el 05 frena ahí: el 05 se vuelve a procesar.
    assert.equal(advanceLastFullDay({ lastFullDay: "2026-10-03", floor, completeDates: ["2026-10-04", "2026-10-05", "2026-10-06"], blockedDates: ["2026-10-05"] }), "2026-10-04");
    assert.equal(advanceLastFullDay({ floor, completeDates: [] }), null);
});

test("spread: reparte la evidencia a lo largo de toda la franja", () => {
    assert.deepEqual(spread([1, 2, 3], 5), [1, 2, 3]);
    assert.deepEqual(spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4), [0, 3, 6, 9]);
});

test("Actividad continua de 2 h da una sola entrada de 120 min", () => {
    const r = resolve([cand("endpoints", buildSegments(every5("09:00", "11:00")))]);
    assert.equal(workedMinutes(byRef(r, "endpoints").segments), 120);
});

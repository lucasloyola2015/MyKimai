// node --test Habilidades/cerrar-jornada/scripts/sync-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    adminMask, advanceLastFullDay, isBillingToolUse, agentTaskText, autoRef, buildSegments, dayWindow, decideAction, entrySegments,
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
/** Ventana como la arma plan: con su fecha y su tipo. */
const win = (scope = "day") => ({ ...dayWindow(D, scope), date: D, scope });
const resolve = (candidates, existing = []) =>
    resolveWindow({ window: win(), candidates, existing, projects: PROJECTS, now: at("23:59") });
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

// ── Jornada 07–24 y noche autónoma 00–07 ─────────────────────────────────────
test("isNight: de 00:00 a 07:00 es trabajo autónomo", () => {
    assert.equal(isNight(at("21:00")), false);
    assert.equal(isNight(at("23:59")), false);
    assert.equal(isNight(at("00:00")), true);
    assert.equal(isNight(at("00:30")), true);
    assert.equal(isNight(at("06:59")), true);
    assert.equal(isNight(at("07:00")), false);
});

test("dayWindow y workdayOf: la noche (00 a 07 del día siguiente) es de la fecha anterior", () => {
    const night = dayWindow(D, "night");
    assert.equal(night.start, at("00:00", "2026-10-06"));
    assert.equal(dayWindow(D).end, at("00:00", "2026-10-06"));
    assert.equal(night.end, at("07:00", "2026-10-06"));
    assert.equal(workdayOf(at("02:00", "2026-10-06")), D);
    assert.equal(workdayOf(at("07:00", "2026-10-06")), "2026-10-06");
});

test("windowSegments: un evento suelto a las 23:58 no invade la noche", () => {
    assert.deepEqual(spans(windowSegments([at("23:30"), at("23:58")], dayWindow(D))), ["23:30–00:00"]);
    assert.deepEqual(spans(windowSegments([at("23:58")], dayWindow(D))), []);
});

test("windowSegments: con los eventos vecinos, la continuidad no se corta a las 21:00 (ni a las 07:00)", () => {
    // Actividad 19:00–20:30, un evento a las 21:10 y después 21:15–23:00: el hueco de 40 min no es pausa.
    const times = [...every5("19:00", "20:30"), at("21:10"), ...every5("21:15", "23:00")];
    assert.deepEqual(spans(windowSegments(times, dayWindow(D))), ["19:00–21:00"]);
    assert.deepEqual(spans(windowSegments(times, dayWindow(D, "night"))), ["21:00–23:00"]);
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

// Formato real de un mensaje entre sesiones (send_message): isMeta, origen "peer".
const peerMsg = (text) => ({ type: "user", isMeta: true, origin: { kind: "peer" }, message: { content: `Another Claude session sent a message:\n<cross-session-message from="local_x">${text}</cross-session-message>` } });

test("adminMask: el turno que abre el aviso de una duda (formato real) no es trabajo", () => {
    const m = mask([
        userMsg("arreglá el bot"), assistant(["Bash", { command: "npm test" }]), toolResult(), assistant(),
        peerMsg("[Agente de horas de MyKimai] Trabajo en una carpeta sin proyecto…"), assistant(),
        userMsg("seguí con el bot"), assistant(["Edit", { file_path: "bot.ts" }]),
    ]);
    assert.deepEqual(m, [false, false, false, false, true, true, false, false]);
});

test("adminMask: otros mensajes entre sesiones son trabajo y abren un turno normal", () => {
    const m = mask([peerMsg("revisá el PR del bot"), assistant(["Bash", { command: "gh pr view 12" }]), toolResult()]);
    assert.deepEqual(m, [false, false, false]);
});

test("adminMask: resolver una duda o cerrar la jornada no es trabajo; el resto del turno sí", () => {
    const resolver = mask([
        userMsg("ponelo en IA Agent"), assistant(["Edit", { file_path: "C:\\Users\\loyol\\.mykimai\\proyectos.json" }]), toolResult(),
        assistant(["Bash", { command: "node C:/Users/loyol/.claude/skills/cerrar-jornada/scripts/sync.mjs plan --date 2026-10-05" }]),
    ]);
    assert.deepEqual(resolver, [true, true, true, true]);
    const antes = mask([
        userMsg("terminá el bot y cerrá la jornada"), assistant(["Edit", { file_path: "bot.ts" }]), toolResult(),
        assistant(["mcp__mykimai__create_time_entry", { title: "x" }]), toolResult(), assistant(),
    ]);
    assert.deepEqual(antes, [false, false, false, true, true, true]);
    // Cargar y después seguir con el cliente en el mismo turno: lo de después cuenta.
    const despues = mask([
        userMsg("dale"), assistant(["mcp__mykimai__create_time_entry", { title: "x" }]), toolResult(),
        assistant(["Edit", { file_path: "src/dxf.ts" }]), toolResult(), assistant(["Bash", { command: "npm test" }]), toolResult(), assistant(),
    ]);
    assert.deepEqual(despues, [true, true, true, false, false, false, false, false]);
    // Repartir dudas (lo pide el hook) en medio de un turno de trabajo: solo se descarta el reparto.
    const reparto = mask([
        userMsg("seguí con el bot"), assistant(["ToolSearch", { query: "select:mcp__ccd_session_mgmt__send_message" }]),
        assistant(["Read", { file_path: "C:/Users/loyol/.mykimai/sync/dudas.json" }]), toolResult(),
        assistant(["mcp__ccd_session_mgmt__send_message", { session_id: "x", message: "y" }]), toolResult(),
        assistant(["Edit", { file_path: "bot.ts" }]), toolResult(),
    ]);
    assert.deepEqual(reparto, [true, true, true, true, true, true, false, false]);
});

test("isBillingToolUse: ejecutar el agente es administración; desarrollarlo (grep, git, editar) no", () => {
    const bash = (command) => isBillingToolUse({ name: "Bash", input: { command } });
    assert.equal(bash("node C:/Users/loyol/.claude/skills/cerrar-jornada/scripts/sync.mjs apply --textos -"), true);
    assert.equal(bash("cat C:/Users/loyol/.mykimai/sync/dudas.json"), true);
    assert.equal(bash("grep -n foo Habilidades/cerrar-jornada/scripts/sync.mjs"), false);
    assert.equal(bash("git commit -m 'fix: sync.mjs'"), false);
    assert.equal(isBillingToolUse({ name: "Edit", input: { file_path: "C:/repo/Habilidades/cerrar-jornada/scripts/sync.mjs" } }), false);
    assert.equal(isBillingToolUse({ name: "Read", input: { file_path: "C:/Users/loyol/.claude/skills/cerrar-jornada/AGENTE.md" } }), true);
    assert.equal(isBillingToolUse({ name: "ToolSearch", input: { query: "select:Read,Edit" } }), false);
});

test("humanPrompt: sin mensajes meta ni avisos; el pedido real aunque venga después de un <system-reminder>", () => {
    assert.equal(humanPrompt(userMsg("Generá el handoff…", { isMeta: true })), null);
    assert.equal(humanPrompt(userMsg("[Cross-session delivery notice] held")), null);
    assert.equal(humanPrompt(userMsg("arreglá el bot")), "arreglá el bot");
    const worktree = { type: "user", message: { content: [{ type: "text", text: "<system-reminder>\nYou are operating in a git worktree\n</system-reminder>" }, { type: "text", text: "Necesito una API key" }] } };
    assert.equal(humanPrompt(worktree), "Necesito una API key");
});

test("Un timer en curso o una hora desmedida no recortan: en paralelo si son de otro proyecto, duda si son del mismo", () => {
    const timer = manual("banco", "08:00", "08:00", { end_time: null });
    const larga = manual("gps", "00:00", "23:00");
    const r = resolve([cand("ia-agent", [seg("09:00", "12:00")]), cand("endpoints", [seg("13:00", "15:00")])], [timer, larga]);
    assert.equal(workedMinutes(byRef(r, "ia-agent").segments), 180);
    assert.equal(byRef(r, "ia-agent").allow_overlap, true);
    assert.equal(byRef(r, "endpoints").allow_overlap, true);
    assert.deepEqual(r.doubts.map((d) => d.kind).sort(), ["hora_desmedida", "hora_en_curso"]);
    // Del mismo proyecto: la API no deja duplicar, así que no se carga.
    const mismo = resolve([cand("banco", [seg("09:00", "11:00")])], [timer]);
    assert.equal(mismo.entries.length, 0);
    assert.ok(mismo.doubts.some((d) => d.kind === "choca_con_timer"));
});

test("Una hora del agente que quedó huérfana (carpeta remapeada) no se duplica en paralelo: duda", () => {
    const vieja = manual("endpoints", "09:00", "12:00", { external_ref: autoRef("endpoints", D, false) });
    const r = resolve([cand("ia-agent", [seg("09:00", "12:00")])], [vieja]);
    assert.equal(r.entries.length, 0);
    assert.equal(r.doubts[0].kind, "hora_huerfana");
    // Si está congelada (Lucas la editó), es un obstáculo legítimo: van en paralelo.
    const congelada = resolveWindow({ window: win(), candidates: [cand("ia-agent", [seg("09:00", "12:00")])], existing: [vieja], projects: PROJECTS, now: at("23:59"), frozenRefs: new Set([vieja.external_ref]) });
    assert.equal(congelada.entries[0].allow_overlap, true);
});

test("La hora unificada se arma con los eventos: un hueco menor a la pausa entre proyectos es continuo", () => {
    const withTimes = (projectId, ...ranges) => {
        const times = ranges.flatMap(([a, z]) => every5(a, z));
        return { ...cand(projectId, buildSegments(times)), times };
    };
    // Medidor 09:00–10:00 y 11:30–12:00 (con su propia pausa en el medio); Easy CAD 09:30–10:45.
    const r = resolve([withTimes("medidor", ["09:00", "10:00"], ["11:30", "12:00"]), withTimes("easycad", ["09:30", "10:45"])]);
    assert.equal(r.entries.length, 1);
    assert.deepEqual(spans(r.entries[0].segments), ["09:00–12:00"]);
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
    // Más de 7 días sin correr: lo salteado ya se informó y no traba el avance.
    assert.equal(advanceLastFullDay({ lastFullDay: "2026-10-03", floor, completeDates: ["2026-10-07", "2026-10-08"], skippedTo: "2026-10-06" }), "2026-10-08");
});

test("spread: reparte la evidencia a lo largo de toda la franja", () => {
    assert.deepEqual(spread([1, 2, 3], 5), [1, 2, 3]);
    assert.deepEqual(spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4), [0, 3, 6, 9]);
});

// ── Verificación de las correcciones (segunda pasada) ────────────────────────
const timed = (projectId, ...ranges) => {
    const times = ranges.flatMap((r) => (Array.isArray(r) ? every5(r[0], r[1]) : [at(r)]));
    return { ...cand(projectId, buildSegments(times)), times };
};

test("Unificar hasta que no quede nada: la hora que crece no puede tapar a otra del mismo cliente", () => {
    const projects = new Map(PROJECTS);
    projects.set("flejadora", project("flejadora", AGU));
    // A: 09–10 y 11:10–12; B: 09:30–10 y 10:35; C: 10:40–11:10 (no se cruza con los tramos de A ni B).
    const a = timed("medidor", ["09:00", "10:00"], ["11:10", "12:00"]);
    const b = timed("easycad", ["09:30", "10:00"], "10:35");
    const c = timed("flejadora", ["10:40", "11:10"]);
    const r = resolveWindow({ window: win(), candidates: [a, b, c], existing: [], projects, now: at("23:00") });
    const agustin = r.entries.filter((e) => e.project.client.id === "c-agu");
    assert.equal(agustin.length, 1);
    assert.deepEqual(spans(agustin[0].segments), ["09:00–12:00"]);
    // Los tres proyectos quedan en esa única hora (la principal más las unificadas).
    assert.deepEqual([agustin[0].project.id, ...agustin[0].unified.map((u) => u.project_id)].sort(), ["easycad", "flejadora", "medidor"]);
});

test("Al unificar, la principal es la hora propia que ya existe (se actualiza; no queda otra suelta)", () => {
    const yaCargada = manual("medidor", "09:00", "10:00", { external_ref: autoRef("medidor", D, false) });
    const r = resolve([timed("medidor", ["09:00", "10:00"]), timed("easycad", ["09:30", "13:00"])], [yaCargada]);
    assert.equal(r.entries.length, 1);
    assert.equal(r.entries[0].ref, autoRef("medidor", D, false));
    assert.equal(r.doubts.length, 0);
});

test("Huérfanas: solo de esta ventana y sin candidata conocida (válida, inválida o absorbida)", () => {
    // Una hora propia de la jornada no es huérfana para la noche.
    const deDia = manual("endpoints", "20:00", "22:00", { external_ref: autoRef("endpoints", D, false) });
    const noche = resolveWindow({ window: win("night"), candidates: [cand("ia-agent", [seg("21:00", "23:00")], { autonomous: true })], existing: [deDia], projects: PROJECTS, now: at("23:59") });
    assert.equal(noche.entries.length, 1);
    assert.equal(noche.doubts.filter((d) => d.kind === "hora_huerfana").length, 0);
    // Un proyecto que pasó a inactivo no deja huérfana su hora: los otros clientes van en paralelo.
    const projects = new Map(PROJECTS);
    projects.set("banco", project("banco", PAP, { status: "completed" }));
    const vieja = manual("banco", "09:00", "11:00", { external_ref: autoRef("banco", D, false) });
    const r = resolveWindow({ window: win(), candidates: [cand("banco", [seg("09:00", "11:00")]), cand("ia-agent", [seg("10:00", "12:00")])], existing: [vieja], projects, now: at("23:00") });
    assert.ok(r.entries.some((e) => e.project.id === "ia-agent"));
    assert.equal(r.doubts.filter((d) => d.kind === "hora_huerfana").length, 0);
});

test("adminMask: coordinar sesiones de clientes es trabajo; solo el aviso de una duda es administración", () => {
    const coordinar = mask([
        userMsg("tomalo vos y archivá al terminar"), assistant(["mcp__ccd_session_mgmt__list_sessions", {}]), toolResult(),
        assistant(["Bash", { command: "git log -3" }]), toolResult(), assistant(["mcp__ccd_session_mgmt__archive_session", { session_id: "x" }]), toolResult(),
    ]);
    assert.deepEqual(coordinar, [false, false, false, false, false, false, false]);
    const respuesta = mask([peerMsg("¿terminaste con enlace.cpp?"), assistant(["mcp__ccd_session_mgmt__send_message", { message: "sí" }]), toolResult(), assistant()]);
    assert.deepEqual(respuesta, [false, false, false, false]);
});

test("adminMask: después del aviso de una duda, un cron que retoma el trabajo cuenta", () => {
    const m = mask([
        peerMsg("[Agente de horas de MyKimai] duda…"), assistant(),
        { type: "user", isMeta: true, promptSource: "sdk", message: { content: "Vigilancia nocturna de Florida01" } },
        assistant(["Bash", { command: "ssh florida01 tail -n 50 log" }]), toolResult(), assistant(["Edit", { file_path: "firmware/anillo.c" }]),
    ]);
    assert.deepEqual(m, [true, true, true, false, false, false]);
});

test("adminMask: el trabajo intercalado entre dos bloques de administración cuenta", () => {
    const m = mask([
        userMsg("seguí con el bot"), assistant(["Read", { file_path: "C:/Users/loyol/.mykimai/sync/dudas.json" }]), toolResult(),
        assistant(["Edit", { file_path: "bot.ts" }]), toolResult(), assistant(["Bash", { command: "npm test" }]), toolResult(),
        assistant(["mcp__ccd_session_mgmt__send_message", { message: "[Agente de horas de MyKimai] duda" }]), toolResult(),
        assistant(["Edit", { file_path: "C:/Users/loyol/.mykimai/sync/dudas.json" }]), toolResult(), assistant(),
    ]);
    assert.deepEqual(m, [true, true, true, false, false, false, false, true, true, true, true, true]);
});

test("isBillingToolUse: desarrollar el agente no es administración (heredocs, --check, commits, grep)", () => {
    const bash = (command) => isBillingToolUse({ name: "Bash", input: { command } });
    assert.equal(bash("node --check C:/Users/loyol/.claude/skills/cerrar-jornada/scripts/sync.mjs"), false);
    assert.equal(bash("node - \"$PWD/Habilidades/cerrar-jornada/scripts/sync.mjs\" <<'EOF'\nconst x = 1;\nEOF"), false);
    assert.equal(bash("git add Habilidades && git commit -m \"docs: ~/.mykimai/proyectos.json\""), false);
    assert.equal(bash("grep -rn \"~/.mykimai/sync\" Habilidades/"), false);
    assert.equal(bash("cd C:/x && node C:/Users/loyol/.claude/skills/cerrar-jornada/scripts/jornada.mjs --date 2026-10-01"), true);
    assert.equal(isBillingToolUse({ name: "Read", input: { file_path: "C:/repo/Habilidades/cerrar-jornada/SKILL.md" } }), false);
    assert.equal(humanPrompt(userMsg("The app was quit while you were working. Please continue from where you left off.")), null);
});

test("Actividad continua de 2 h da una sola entrada de 120 min", () => {
    const r = resolve([cand("endpoints", buildSegments(every5("09:00", "11:00")))]);
    assert.equal(workedMinutes(byRef(r, "endpoints").segments), 120);
});

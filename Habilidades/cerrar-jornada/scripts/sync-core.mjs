/**
 * Lógica pura del agente de horas (sin IO): tramos con pausas, trabajo autónomo, reglas de
 * superposición entre clientes y qué hacer con lo que ya está cargado. Hora de Argentina
 * (UTC−3 todo el año). Los tiempos internos son milisegundos epoch; los segmentos, `[inicio, fin)`.
 */

export const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
export const MIN_WORKED_MIN = 30;
/** Una hora cargada más larga que esto (o un timer en curso) es sospechosa: no se usa para recortar. */
export const MAX_SANE_ENTRY_MIN = 16 * 60;
/** Sin ningún evento durante este tiempo, se entiende que no hay más actividad: empieza una pausa. */
export const DEFAULT_PAUSE_MIN = 60;
/**
 * La jornada de Lucas es de 07:00 a 21:00 ("nunca trabajo más de las 21"). De 21:00 a 07:00 del día
 * siguiente trabajan solos los agentes: es TRABAJO AUTÓNOMO y se carga aparte, una entrada por noche.
 */
export const DAY_FROM_H = 7;
export const DAY_TO_H = 21;
/** Prefijo de `external_ref` de las entradas que carga este agente. */
export const AUTO_REF_PREFIX = "auto:";
/** Marca del prompt del agente de las 7: sus propias sesiones no son trabajo. */
export const SYNC_MARKER = "[mykimai-sync]";

const MIN = 60_000;
const STEP = 5 * MIN;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// ── Hora de Argentina ────────────────────────────────────────────────────────
export const arDayStart = (ymd) => Date.parse(`${ymd}T00:00:00-03:00`);
/** ISO con offset de Argentina, ej. 2026-10-02T09:15:00-03:00 */
export const toArIso = (ms) => new Date(ms - AR_OFFSET_MS).toISOString().slice(0, 19) + "-03:00";
export const toArHm = (ms) => toArIso(ms).slice(11, 16);
export const arYmd = (ms) => toArIso(ms).slice(0, 10);
export const addDays = (ymd, n) => arYmd(arDayStart(ymd) + n * DAY);
/** Fuera de la jornada (21:00–07:00): trabajo autónomo. */
export const isNight = (ms) => {
    const h = new Date(ms - AR_OFFSET_MS).getUTCHours();
    return h >= DAY_TO_H || h < DAY_FROM_H;
};
/** Fecha a la que pertenece un instante: lo de antes de las 07:00 es la noche del día anterior. */
export const workdayOf = (ms) => arYmd(ms - DAY_FROM_H * HOUR);

/**
 * Ventanas de una fecha: la jornada (`day`, 07:00–21:00) y la noche que empieza ese día
 * (`night`, 21:00 → 07:00 del día siguiente).
 */
export function dayWindow(ymd, scope = "day") {
    const start = arDayStart(ymd);
    return scope === "night"
        ? { start: start + DAY_TO_H * HOUR, end: start + DAY + DAY_FROM_H * HOUR }
        : { start: start + DAY_FROM_H * HOUR, end: start + DAY_TO_H * HOUR };
}

/**
 * Qué procesar en una corrida automática: las fechas COMPLETAS (su noche terminó, o sea son las
 * 07:00 del día siguiente) desde la última sincronizada, como mucho `maxDaysBack` y nunca antes de
 * `floor`; cada una con su jornada y su noche. `skipped` son las que quedaron afuera por el tope
 * (se cargan con --date).
 */
export function windowsToProcess({ lastFullDay, nowMs, floor, maxDaysBack = 7 }) {
    const lastComplete = addDays(workdayOf(nowMs), -1);
    let from = lastFullDay ? addDays(lastFullDay, 1) : floor;
    if (from < floor) from = floor;
    const oldest = addDays(lastComplete, -(maxDaysBack - 1));
    const skipped = from < oldest ? { from, to: addDays(oldest, -1) } : null;
    if (skipped) from = oldest;
    const windows = [];
    for (let d = from; d <= lastComplete; d = addDays(d, 1)) {
        windows.push({ date: d, scope: "day" }, { date: d, scope: "night" });
    }
    return { windows, skipped };
}

/**
 * Hasta qué fecha queda sincronizado después de un apply automático: avanza de a una fecha
 * contigua mientras esté completa en el plan y no haya tenido errores reintentables (red, error
 * interno, textos faltantes), que se vuelven a intentar en la corrida siguiente.
 */
export function advanceLastFullDay({ lastFullDay, floor, completeDates, blockedDates = [] }) {
    const complete = new Set(completeDates);
    const blocked = new Set(blockedDates);
    let last = lastFullDay ?? addDays(floor, -1);
    for (let d = addDays(last, 1); complete.has(d) && !blocked.has(d); d = addDays(d, 1)) last = d;
    return last === addDays(floor, -1) ? lastFullDay ?? null : last;
}

export const autoRef = (projectId, ymd, autonomous) =>
    `${AUTO_REF_PREFIX}${projectId}:${ymd}${autonomous ? ":autonomo" : ""}`;

// ── Segmentos ────────────────────────────────────────────────────────────────
export function mergeSegments(segs) {
    const out = [];
    for (const [a, z] of [...segs].sort((x, y) => x[0] - y[0])) {
        const last = out.at(-1);
        if (last && a <= last[1]) last[1] = Math.max(last[1], z);
        else out.push([a, z]);
    }
    return out;
}

/**
 * Tramos trabajados a partir de instantes de actividad: el reloj corre mientras hay eventos y,
 * tras más de `pauseMin` minutos sin ninguno, empieza una pausa. Redondeo a 5 min; un evento
 * suelto vale 5 min.
 */
export function buildSegments(times, pauseMin = DEFAULT_PAUSE_MIN) {
    const spans = [];
    for (const t of [...times].sort((a, b) => a - b)) {
        const last = spans.at(-1);
        if (last && t - last[1] <= pauseMin * MIN) last[1] = t;
        else spans.push([t, t]);
    }
    return mergeSegments(
        spans.map(([a, z]) => {
            const s = Math.round(a / STEP) * STEP;
            const e = Math.round(z / STEP) * STEP;
            return [s, e > s ? e : s + STEP];
        })
    );
}

export const workedMinutes = (segs) => Math.round(segs.reduce((t, [a, z]) => t + (z - a), 0) / MIN);

export function subtractSegments(segs, cuts) {
    let out = segs.map(([a, z]) => [a, z]);
    for (const [ca, cz] of cuts) {
        const next = [];
        for (const [a, z] of out) {
            if (cz <= a || ca >= z) {
                next.push([a, z]);
                continue;
            }
            if (ca > a) next.push([a, ca]);
            if (cz < z) next.push([cz, z]);
        }
        out = next;
    }
    return out.filter(([a, z]) => z > a);
}

export const clipSegments = (segs, from, to) =>
    segs.map(([a, z]) => [Math.max(a, from), Math.min(z, to)]).filter(([a, z]) => z > a);

/**
 * Tramos de una ventana: el redondeo no puede sacarlos de ella (un evento suelto a las 20:58 no
 * puede invadir la noche, que es otra entrada del mismo proyecto).
 */
export const windowSegments = (times, window, pauseMin = DEFAULT_PAUSE_MIN) =>
    clipSegments(buildSegments(times, pauseMin), window.start, window.end);

export const segmentsIntersect = (xs, ys) => xs.some(([a, z]) => ys.some(([c, d]) => a < d && c < z));

const floorMin = (ms) => Math.floor(ms / MIN) * MIN;
const ceilMin = (ms) => Math.ceil(ms / MIN) * MIN;

/**
 * Lo TRABAJADO de una entrada ya cargada (inicio–fin menos sus pausas). Se agranda al minuto
 * entero (pausas hacia adentro) para no dejar migas de segundos al recortar contra ella.
 * Un timer en curso trabaja hasta `nowMs`.
 */
export function entrySegments(entry, nowMs) {
    const start = floorMin(Date.parse(entry.start_time));
    const end = ceilMin(entry.end_time ? Date.parse(entry.end_time) : nowMs);
    const breaks = (entry.breaks ?? []).map((b) => [
        ceilMin(Date.parse(b.start_time)),
        floorMin(b.end_time ? Date.parse(b.end_time) : nowMs),
    ]);
    return subtractSegments([[start, end]], breaks);
}

/** Inicio, fin y pausas (los huecos entre segmentos) para la API. */
export function toEntryTimes(segs) {
    return {
        start_time: toArIso(segs[0][0]),
        end_time: toArIso(segs.at(-1)[1]),
        breaks: segs.slice(1).map(([a], i) => ({ start_time: toArIso(segs[i][1]), end_time: toArIso(a) })),
        worked_spans: segs.map(([a, z]) => `${toArHm(a)}–${toArHm(z)}`),
        minutes: workedMinutes(segs),
    };
}

// ── Reglas entre clientes ────────────────────────────────────────────────────
/**
 * Superposiciones (reglas de Lucas):
 * - Clientes distintos en paralelo: vale y ninguno se recorta (ninguno se entera del trabajo del
 *   otro). Jeremías, Agustín y Ezequiel son clientes distintos de Illinois.
 * - Mismo cliente, dos proyectos en paralelo: se unifican en UNA hora continua, en el proyecto con
 *   más tiempo trabajado.
 * - Mismo proyecto: nunca se duplica.
 */
export const sameClient = (p, q) => Boolean(p?.client?.id) && p.client.id === q?.client?.id;

/** Evidencia de varias candidatas unificadas, con el proyecto de cada línea. */
function mergeEvidence(tagged) {
    const out = {
        events: { session: 0, agent: 0, commits: 0 },
        prompts: [], prompts_total: 0, context_prompts: [], agent_tasks: [], agent_tasks_total: 0,
        commits: [], commits_total: 0, sessions: [],
    };
    const tag = (name) => (s) => (/^\d{2}:\d{2} /.test(s) ? `${s.slice(0, 6)}[${name}] ${s.slice(6)}` : `[${name}] ${s}`);
    for (const [name, ev] of tagged) {
        if (!ev) continue;
        for (const k of Object.keys(out.events)) out.events[k] += ev.events?.[k] ?? 0;
        for (const k of ["prompts", "context_prompts", "agent_tasks", "commits"]) out[k].push(...(ev[k] ?? []).map(tag(name)));
        for (const k of ["prompts_total", "agent_tasks_total", "commits_total"]) out[k] += ev[k] ?? ev[k.replace("_total", "")]?.length ?? 0;
        out.sessions.push(...(ev.sessions ?? []));
    }
    return out;
}

/**
 * Une las candidatas del MISMO cliente que se superponen (y las que se encadenan con ellas) en una
 * sola, en el proyecto con más tiempo trabajado; sus tramos se suman como una hora continua.
 */
export function unifySameClient(candidates, projects) {
    const parent = candidates.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            const [a, b] = [candidates[i], candidates[j]];
            if (a.project_id !== b.project_id && sameClient(projects.get(a.project_id), projects.get(b.project_id)) && segmentsIntersect(a.segments, b.segments)) {
                parent[find(j)] = find(i);
            }
        }
    }
    const groups = new Map();
    candidates.forEach((c, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), c]));
    const name = (c) => projects.get(c.project_id)?.name ?? c.project_id;
    return [...groups.values()].map((group) => {
        if (group.length === 1) return group[0];
        const [main, ...others] = [...group].sort((x, y) => workedMinutes(y.segments) - workedMinutes(x.segments) || x.firstEvent - y.firstEvent);
        return {
            ...main,
            segments: mergeSegments(group.flatMap((c) => c.segments)),
            firstEvent: minOf(group.map((c) => c.firstEvent)),
            evidence: mergeEvidence([main, ...others].map((c) => [name(c), c.evidence])),
            unified: others.map((c) => ({ ref: c.ref, project_id: c.project_id, project: name(c) })),
        };
    });
}

const describe = (e) => `"${e.title ?? "(sin título)"}" (${e.project.name}, ${toArHm(Date.parse(e.start_time))}–${e.end_time ? toArHm(Date.parse(e.end_time)) : "en curso"})`;

/**
 * Resuelve las candidatas de UNA ventana (una jornada o una noche) contra lo ya cargado y entre sí.
 *
 * - Mismo cliente en paralelo: las candidatas se unifican (`unifySameClient`); contra una hora ya
 *   cargada por otro (a mano, el skill, la UI), que nunca se toca, la candidata se recorta: ese
 *   tiempo ya está contado para ese cliente.
 * - Clientes distintos en paralelo: no se recorta nada; las dos llevan `allow_overlap`.
 * - Si el MISMO proyecto ya tiene horas cargadas por otro en la ventana (misma clase: jornada o
 *   noche), se asume cargado a mano: lo que sobre de 30 min o más es una duda, no una carga.
 * - Menos de 30 minutos trabajados no se registra.
 *
 * @param {object} p
 * @param {{start:number,end:number}} p.window
 * @param {Array} p.candidates  { ref, date, project_id, autonomous, segments, firstEvent, evidence }
 * @param {Array} p.existing    entradas de la API (EntryView) que tocan la ventana
 * @param {Map}   p.projects    id → proyecto de la API (con client y is_billable)
 */
export function resolveWindow({ window, candidates, existing, projects, now }) {
    const entries = [];
    const discarded = [];
    const doubts = [];

    const valid = [];
    for (const c of candidates) {
        const project = projects.get(c.project_id);
        const base = { ref: c.ref, date: c.date, autonomous: c.autonomous, evidence: c.evidence };
        if (!project) {
            doubts.push({ ...base, kind: "proyecto_inexistente", project_id: c.project_id, ...toEntryTimes(c.segments),
                message: `La carpeta está mapeada al proyecto ${c.project_id}, que no existe en MyKimai.` });
        } else if (project.status && project.status !== "active") {
            doubts.push({ ...base, kind: "proyecto_inactivo", project, ...toEntryTimes(c.segments),
                message: `Hay trabajo en "${project.client.name} / ${project.name}", pero el proyecto está ${project.status}.` });
        } else {
            valid.push(c);
        }
    }
    const unified = unifySameClient(valid, projects).sort((a, b) => a.firstEvent - b.firstEvent || a.ref.localeCompare(b.ref));

    const refs = new Set(unified.map((c) => c.ref));
    // Un timer en curso (quizás olvidado) o una hora desmedida no se usa para recortar: sería
    // tragarse trabajo real sin avisar. Queda como duda.
    const sane = (e) => e.end_time && Date.parse(e.end_time) - Date.parse(e.start_time) <= MAX_SANE_ENTRY_MIN * MIN;
    for (const e of existing.filter((x) => !refs.has(x.external_ref ?? "") && !sane(x))) {
        doubts.push({
            kind: e.end_time ? "hora_desmedida" : "hora_en_curso", ref: `existente:${e.id}`, date: window.date ?? null,
            entry_id: e.id, project: projects.get(e.project.id) ?? { id: e.project.id, name: e.project.name, client: e.client },
            message: e.end_time
                ? `La hora ${describe(e)} dura más de ${MAX_SANE_ENTRY_MIN / 60} h: no la usé para recortar nada. ¿Quedó un timer prendido?`
                : `Hay un timer en curso desde ${toArIso(Date.parse(e.start_time)).slice(0, 16).replace("T", " ")} (${e.project.name}): no lo usé para recortar nada. ¿Quedó prendido?`,
        });
    }
    const obstacles = existing
        .filter((e) => !refs.has(e.external_ref ?? "") && sane(e))
        .map((e) => ({
            entry: e,
            project: projects.get(e.project.id) ?? { id: e.project.id, name: e.project.name, client: e.client },
            segs: clipSegments(entrySegments(e, now), window.start, window.end),
        }))
        .filter((o) => o.segs.length);

    for (const c of unified) {
        const project = projects.get(c.project_id);
        const base = { ref: c.ref, date: c.date, autonomous: c.autonomous, evidence: c.evidence, unified: c.unified ?? [] };
        const rawMinutes = workedMinutes(c.segments);
        let segs = c.segments;
        let allowOverlap = false;
        const notes = c.unified?.length ? [`unificada con ${c.unified.map((u) => u.project).join(", ")} (mismo cliente, en paralelo)`] : [];
        const sameProject = obstacles.filter((o) => o.project.id === c.project_id && o.entry.autonomous === c.autonomous);

        for (const o of obstacles) {
            if (sameProject.includes(o) || !segmentsIntersect(segs, o.segs)) continue;
            if (sameClient(project, o.project)) {
                segs = subtractSegments(segs, o.segs);
                notes.push(`recortada donde ya estaba ${describe(o.entry)} (mismo cliente)`);
            } else {
                allowOverlap = true;
            }
        }

        // El mismo proyecto ya cargado por otro: se asume cargado a mano. Se mira lo que sobra
        // DESPUÉS de los recortes por el mismo cliente (lo que igual se le recortaría no cuenta).
        if (sameProject.length) {
            const rest = subtractSegments(segs, sameProject.flatMap((o) => o.segs));
            const already = sameProject.map((o) => describe(o.entry));
            if (workedMinutes(rest) >= MIN_WORKED_MIN) {
                doubts.push({ ...base, kind: "cargado_a_mano_parcial", project, ...toEntryTimes(rest), existing: already,
                    message: `"${project.name}" ya tiene horas cargadas a mano ese día (${already.join("; ")}), pero hay ${workedMinutes(rest)} min de actividad fuera de ellas.` });
            } else {
                discarded.push({ ...base, project, raw_minutes: rawMinutes, reason: `ya cargado a mano: ${already.join("; ")}` });
            }
            continue;
        }

        if (!segs.length || workedMinutes(segs) < MIN_WORKED_MIN) {
            discarded.push({ ...base, project, raw_minutes: rawMinutes, reason: `menos de ${MIN_WORKED_MIN} min trabajados (${workedMinutes(segs)} min)` });
            continue;
        }
        entries.push({ ...base, project, project_id: c.project_id, segments: segs, raw_minutes: rawMinutes, allow_overlap: allowOverlap, notes });
    }

    // Clientes distintos en paralelo: valen las dos, y la API pide allow_overlap en ambas.
    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            if (!sameClient(entries[i].project, entries[j].project) && segmentsIntersect(entries[i].segments, entries[j].segments)) {
                entries[i].allow_overlap = true;
                entries[j].allow_overlap = true;
            }
        }
    }
    return { entries, discarded, doubts };
}

// ── Qué hacer con lo que el agente ya cargó ──────────────────────────────────
/** Huella de una entrada de la API: si cambia entre corridas, la editó el usuario. */
export function fingerprint(e) {
    return JSON.stringify([
        e.project.id,
        Boolean(e.autonomous),
        Date.parse(e.start_time),
        e.end_time ? Date.parse(e.end_time) : null,
        (e.breaks ?? []).map((b) => [Date.parse(b.start_time), b.end_time ? Date.parse(b.end_time) : null]).sort((a, b) => a[0] - b[0]),
        e.title ?? null,
        e.description ?? null,
    ]);
}

function sameTimes(e, segs) {
    const t = toEntryTimes(segs);
    const ms = (iso) => Date.parse(iso);
    const breaks = (e.breaks ?? []).map((b) => [ms(b.start_time), ms(b.end_time)]).sort((a, b) => a[0] - b[0]);
    return ms(e.start_time) === ms(t.start_time) && ms(e.end_time) === ms(t.end_time) &&
        JSON.stringify(breaks) === JSON.stringify(t.breaks.map((b) => [ms(b.start_time), ms(b.end_time)]));
}

/**
 * Por qué una hora que ya tiene la referencia del agente queda congelada (o null si el agente
 * todavía puede ajustarla): facturada, editada a mano desde la última carga, o de origen desconocido.
 * Una hora congelada se respeta tal como está: cuenta con sus tramos reales.
 */
export function frozenReason(current, stateRec) {
    if (!current) return stateRec ? "la borraste; no la vuelvo a crear" : null;
    if (current.is_billed) return "ya está facturada";
    if (!stateRec) return "existe con la misma referencia pero no la registró este agente";
    if (stateRec.fingerprint !== fingerprint(current)) return "la editaste a mano; no la toco";
    return null;
}

/**
 * create | update (solo horarios y pausas; el texto queda) | noop | skip.
 * Nunca recrea lo que el usuario borró ni pisa lo que editó o lo facturado.
 */
export function decideAction(entry, current, stateRec) {
    if (!current && !stateRec) return { action: "create" };
    if (current && sameTimes(current, entry.segments)) return { action: "noop", entry_id: current.id };
    const frozen = frozenReason(current, stateRec);
    if (frozen) return { action: "skip", reason: frozen, ...(current ? { entry_id: current.id } : {}) };
    return { action: "update", entry_id: current.id };
}

// ── Evidencia de las transcripciones ─────────────────────────────────────────
/** Texto de un mensaje de usuario que NO es resultado de herramienta (null si lo es). */
function userText(entry) {
    if (entry.type !== "user") return null;
    const c = entry.message?.content;
    if (typeof c === "string") return c;
    if (!Array.isArray(c) || c.some((x) => x.type === "tool_result")) return null;
    return c.filter((x) => x.type === "text").map((x) => x.text).join(" ");
}

/** Mensaje que llega de otra sesión (p. ej. el aviso de una duda): no es trabajo para el cliente. */
export function isCrossSessionMessage(entry) {
    return /^(<cross-session-message|Another Claude session|\[Cross-session)/.test((userText(entry) ?? "").trimStart());
}

/** Texto que escribió el usuario (no resultados de herramientas, mensajes entre sesiones ni avisos). */
export function humanPrompt(entry) {
    if (entry.type !== "user" || entry.isSidechain || entry.isMeta) return null;
    const text = userText(entry);
    if (!text || text.startsWith("<") || /^(Another Claude session|\[Cross-session|\[Request interrupted|\[Image|\(Re-invocation|This session is being continued|Base directory for this skill)/.test(text)) return null;
    return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

/**
 * Uso de herramienta que es administración de horas: correr el agente o el cierre de jornada, las
 * herramientas de MyKimai, el skill cerrar-jornada, o tocar los archivos de ~/.mykimai (mapa,
 * plan, dudas). Editar el CÓDIGO del agente no lo es: es desarrollo.
 */
export function isBillingToolUse(use) {
    const input = use.input ?? {};
    if (/^mcp__mykimai__/.test(use.name)) return true;
    if (use.name === "Skill") return /cerrar-jornada/.test(String(input.skill ?? ""));
    if (use.name === "Bash" || use.name === "PowerShell") return /\b(sync|jornada)\.mjs\b/.test(String(input.command ?? ""));
    return /[\\/]\.mykimai[\\/]/i.test(String(input.file_path ?? input.path ?? input.notebook_path ?? ""));
}

/**
 * Clase de un evento de la sesión principal para `adminMask`: `prompt` (un mensaje de texto del
 * usuario abre un turno), `cross` (un mensaje de otra sesión abre un turno), u `other`; `billing`
 * si el asistente usó una herramienta de administración de horas, `tool` si usó cualquier otra.
 */
export function turnEvent(entry) {
    if (entry.type === "user" && !entry.isMeta && userText(entry) !== null) {
        return { kind: isCrossSessionMessage(entry) ? "cross" : "prompt", billing: false, tool: false };
    }
    const uses = entry.type === "assistant" && Array.isArray(entry.message?.content)
        ? entry.message.content.filter((x) => x.type === "tool_use")
        : [];
    const billing = uses.some(isBillingToolUse);
    return { kind: "other", billing, tool: uses.length > 0 && !billing };
}

/**
 * Qué eventos de una sesión NO son trabajo para el cliente (true = se descarta):
 * - el turno que abre un mensaje de otra sesión (el aviso de una duda y lo que responde Claude);
 * - en cualquier turno, la administración de horas desde la primera herramienta de ese tipo hasta
 *   el fin del turno (resolver una duda, cerrar la jornada); si el turno arranca directamente con
 *   eso, el turno entero (el prompt de Lucas incluido).
 */
export function adminMask(events) {
    const mask = events.map(() => false);
    const flush = (start, end) => {
        if (start >= end) return;
        if (events[start].kind === "cross") {
            for (let i = start; i < end; i++) mask[i] = true;
            return;
        }
        let first = -1;
        for (let i = start; i < end; i++) if (events[i].billing) { first = i; break; }
        if (first < 0) return;
        let from = start;
        for (let i = start; i < first; i++) if (events[i].tool) { from = first; break; }
        for (let i = from; i < end; i++) mask[i] = true;
    };
    let start = 0;
    for (let i = 1; i < events.length; i++) {
        if (events[i].kind !== "other") {
            flush(start, i);
            start = i;
        }
    }
    flush(start, events.length);
    return mask;
}

/** Hasta `n` elementos repartidos a lo largo de toda la lista: el primero, el último y parejo en el medio. */
export function spread(list, n) {
    if (list.length <= n) return list;
    return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

/** Mínimo y máximo sin `Math.min(...lista)` (que revienta la pila con cientos de miles de eventos). */
export const minOf = (list) => list.reduce((m, x) => (x < m ? x : m), Infinity);
export const maxOf = (list) => list.reduce((m, x) => (x > m ? x : m), -Infinity);

/** El prompt del agente de las 7 empieza una línea con la marca: esas sesiones no son trabajo. */
export const isSyncPrompt = (text) => text.split("\n").some((line) => line.trimStart().startsWith(SYNC_MARKER));

/**
 * Encargo de un subagente, sin el arnés de los workflows: el mensaje "[Workflow harness — user
 * request]" reenvía un pedido del usuario (no es el encargo); el "[… — computed task]" trae el
 * encargo real después de su primera línea.
 */
export function agentTaskText(text) {
    const t = String(text ?? "").trim();
    if (!t.startsWith("[Workflow harness")) return t.replace(/\s+/g, " ").slice(0, 200) || null;
    if (!/^\[Workflow harness[^\]]*computed task\]/.test(t)) return null;
    const nl = t.indexOf("\n");
    return nl < 0 ? null : t.slice(nl + 1).replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

/** Texto crudo de un mensaje de usuario (para detectar la marca del agente). */
export function rawUserText(entry) {
    if (entry.type !== "user") return "";
    const c = entry.message?.content;
    return typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => x.type === "text").map((x) => x.text).join(" ") : "";
}

// ── Carpetas → proyectos ─────────────────────────────────────────────────────
export const normPath = (p) => String(p).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();

/**
 * Mapeo de una carpeta en `~/.mykimai/proyectos.json`: gana la ruta más específica y una carpeta
 * cubre sus subcarpetas (worktrees incluidos), salvo `"solo_esta_carpeta": true`.
 * Una entrada `{ "ignorar": true }` marca carpetas que no son trabajo facturable ni dudoso.
 */
export function matchFolder(map, ...paths) {
    let best = null;
    for (const raw of paths.filter(Boolean)) {
        const here = normPath(raw);
        for (const [path, entry] of Object.entries(map ?? {})) {
            const key = normPath(path);
            const hit = here === key || (!entry?.solo_esta_carpeta && here.startsWith(key + "/"));
            if (!hit || !(entry?.project_id || entry?.ignorar)) continue;
            if (!best || key.length > best.key.length) best = { key, path, entry };
        }
    }
    return best;
}

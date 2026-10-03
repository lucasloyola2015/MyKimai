/**
 * Lógica pura del agente de horas (sin IO): tramos con pausas, trabajo autónomo, reglas de
 * superposición entre clientes y qué hacer con lo que ya está cargado. Hora de Argentina
 * (UTC−3 todo el año). Los tiempos internos son milisegundos epoch; los segmentos, `[inicio, fin)`.
 */

export const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
export const MIN_WORKED_MIN = 30;
/** Una hora cargada más larga que esto (o un timer en curso) es sospechosa: no se usa para recortar. */
export const MAX_SANE_ENTRY_MIN = 18 * 60;
/** Sin ningún evento durante este tiempo, se entiende que no hay más actividad: empieza una pausa. */
export const DEFAULT_PAUSE_MIN = 60;
/**
 * La jornada de Lucas es de 07:00 a 24:00. De 00:00 a 07:00 del día
 * siguiente trabajan solos los agentes: es TRABAJO AUTÓNOMO y se carga aparte, una entrada por noche.
 */
export const DAY_FROM_H = 7;
export const DAY_TO_H = 24;
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
/** Fuera de la jornada (00:00–07:00): trabajo autónomo. */
export const isNight = (ms) => {
    const h = new Date(ms - AR_OFFSET_MS).getUTCHours();
    return h >= DAY_TO_H || h < DAY_FROM_H;
};
/** Fecha a la que pertenece un instante: lo de antes de las 07:00 es la noche del día anterior. */
export const workdayOf = (ms) => arYmd(ms - DAY_FROM_H * HOUR);

/**
 * Ventanas de una fecha: la jornada (`day`, 07:00–24:00) y la noche que empieza ese día
 * (`night`, 00:00 → 07:00 del día siguiente).
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
export function advanceLastFullDay({ lastFullDay, floor, completeDates, blockedDates = [], skippedTo = null }) {
    const complete = new Set(completeDates);
    const blocked = new Set(blockedDates);
    let last = lastFullDay ?? addDays(floor, -1);
    // Las fechas que el plan salteó por el tope de 7 días ya quedaron informadas: no traban el avance.
    if (skippedTo && skippedTo > last) last = skippedTo;
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

/** Evidencia de varias candidatas unificadas, con el proyecto de cada línea (una sola vez). */
function mergeEvidence(tagged) {
    const out = {
        tagged: true,
        events: { session: 0, agent: 0, commits: 0 },
        prompts: [], prompts_total: 0, context_prompts: [], agent_tasks: [], agent_tasks_total: 0,
        commits: [], commits_total: 0, sessions: [],
    };
    const tag = (name) => (s) => (/^\d{2}:\d{2} /.test(s) ? `${s.slice(0, 6)}[${name}] ${s.slice(6)}` : `[${name}] ${s}`);
    for (const [name, ev] of tagged) {
        if (!ev) continue;
        const mark = ev.tagged ? (s) => s : tag(name);
        for (const k of Object.keys(out.events)) out.events[k] += ev.events?.[k] ?? 0;
        for (const k of ["prompts", "context_prompts", "agent_tasks", "commits"]) out[k].push(...(ev[k] ?? []).map(mark));
        for (const k of ["prompts_total", "agent_tasks_total", "commits_total"]) out[k] += ev[k] ?? ev[k.replace("_total", "")]?.length ?? 0;
        out.sessions.push(...(ev.sessions ?? []));
    }
    return out;
}

/** Una pasada de unificación: agrupa las candidatas del mismo cliente cuyos tramos se cruzan. */
function unifyOnce(candidates, projects, window, pauseMin, preferRefs) {
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
        // La principal: la que ya tiene su hora cargada y ajustable (así se actualiza esa hora y no
        // queda otra suelta); si no, la de más tiempo trabajado.
        const [main, ...others] = [...group].sort((x, y) =>
            Number(preferRefs.has(y.ref)) - Number(preferRefs.has(x.ref)) ||
            workedMinutes(y.segments) - workedMinutes(x.segments) || x.firstEvent - y.firstEvent);
        const withTimes = group.every((c) => Array.isArray(c.times)) && window;
        return {
            ...main,
            times: withTimes ? group.flatMap((c) => c.times) : undefined,
            segments: withTimes
                ? windowSegments(group.flatMap((c) => c.times), window, pauseMin)
                : mergeSegments(group.flatMap((c) => c.segments)),
            firstEvent: minOf(group.map((c) => c.firstEvent)),
            evidence: mergeEvidence([main, ...others].map((c) => [name(c), c.evidence])),
            unified: [
                ...(main.unified ?? []),
                ...others.flatMap((c) => [{ ref: c.ref, project_id: c.project_id, project: name(c) }, ...(c.unified ?? [])]),
            ],
        };
    });
}

/**
 * Une las candidatas del MISMO cliente que se superponen (y las que se encadenan con ellas) en una
 * sola. La hora unificada se arma con los EVENTOS de todas (no con sus tramos): un hueco de menos de
 * una pausa entre un proyecto y el otro es trabajo continuo. Como al unificar la hora puede crecer y
 * cruzarse con otra candidata del mismo cliente, se repite hasta que no haya nada más que unir.
 * `preferRefs`: refs con hora propia ya cargada y ajustable (se prefieren como principal).
 */
export function unifySameClient(candidates, projects, window, pauseMin = DEFAULT_PAUSE_MIN, preferRefs = new Set()) {
    let current = candidates;
    for (;;) {
        const next = unifyOnce(current, projects, window, pauseMin, preferRefs);
        if (next.length === current.length) return next;
        current = next;
    }
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
 * - Un timer en curso o una hora desmedida no recorta (sería tragarse trabajo real): de otro
 *   proyecto, la candidata va en paralelo; del mismo, es una duda (la API no deja duplicar).
 * - Una hora del agente (`auto:`) que ya no tiene actividad propia en esta ventana (p. ej. se
 *   remapeó la carpeta) no se duplica en paralelo con otra: es una duda.
 * - Menos de 30 minutos trabajados no se registra.
 *
 * @param {object} p
 * @param {{start:number,end:number,date?:string,scope?:"day"|"night"}} p.window
 * @param {Array} p.candidates  { ref, date, project_id, autonomous, segments, times?, firstEvent, evidence }
 * @param {Array} p.existing    entradas de la API (EntryView) que tocan la ventana
 * @param {Map}   p.projects    id → proyecto de la API (con client y is_billable)
 * @param {Set}   [p.frozenRefs] refs propias congeladas (editadas, facturadas): obstáculos legítimos
 */
export function resolveWindow({ window, candidates, existing, projects, now, pauseMin = DEFAULT_PAUSE_MIN, frozenRefs = new Set() }) {
    const entries = [];
    const discarded = [];
    const doubts = [];
    const projectOf = (e) => projects.get(e.project.id) ?? { id: e.project.id, name: e.project.name, client: e.client };

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
    // Horas propias ya cargadas y ajustables: si su proyecto entra en una unificación, es la principal.
    const preferRefs = new Set(existing.map((e) => e.external_ref ?? "").filter((r) => r.startsWith(AUTO_REF_PREFIX) && !frozenRefs.has(r)));
    const unified = unifySameClient(valid, projects, window, pauseMin, preferRefs).sort((a, b) => a.firstEvent - b.firstEvent || a.ref.localeCompare(b.ref));

    // Resolver con un conjunto de refs propias "viejas" (stale): sus horas se tratan como huérfanas.
    const solve = (stale) => {
        const entries = [];
        const discarded = [];
        const doubts = [];
        const refs = new Set(unified.map((c) => c.ref).filter((r) => !stale.has(r)));
        // Refs que alguna candidata de esta ventana conoce (válidas, inválidas o absorbidas al unificar).
        const knownRefs = new Set([...candidates.map((c) => c.ref), ...unified.flatMap((c) => (c.unified ?? []).map((u) => u.ref))]);
        const ofThisWindow = (ref) => {
            const m = /^auto:[^:]+:(\d{4}-\d{2}-\d{2})(:autonomo)?$/.exec(ref ?? "");
            return Boolean(m) && m[1] === window.date && Boolean(m[2]) === (window.scope === "night");
        };
        const others = existing.filter((e) => !refs.has(e.external_ref ?? ""));
        const sane = (e) => e.end_time && Date.parse(e.end_time) - Date.parse(e.start_time) <= MAX_SANE_ENTRY_MIN * MIN;
        const segsOf = (e) => clipSegments(entrySegments(e, now), window.start, window.end);
        const suspicious = others.filter((e) => !sane(e)).map((e) => ({ entry: e, project: projectOf(e), segs: segsOf(e) }));
        for (const { entry: e } of suspicious) {
            doubts.push({
                kind: e.end_time ? "hora_desmedida" : "hora_en_curso", ref: `existente:${e.id}`, date: window.date ?? null,
                entry_id: e.id, project: projectOf(e),
                message: e.end_time
                    ? `La hora ${describe(e)} dura más de ${MAX_SANE_ENTRY_MIN / 60} h: no la usé para recortar nada. ¿Quedó un timer prendido?`
                    : `Hay un timer en curso desde ${toArIso(Date.parse(e.start_time)).slice(0, 16).replace("T", " ")} (${e.project.name}): no lo usé para recortar nada. ¿Quedó prendido?`,
            });
        }
        const obstacles = others.filter(sane).map((e) => ({ entry: e, project: projectOf(e), segs: segsOf(e) })).filter((o) => o.segs.length);
        // Horas propias de ESTA ventana que ninguna candidata conoce ni están congeladas: quedaron
        // huérfanas (p. ej. se remapeó la carpeta). Las de otra ventana o fecha son obstáculos normales.
        const orphans = obstacles.filter((o) => {
            const ref = o.entry.external_ref ?? "";
            return ofThisWindow(ref) && (!knownRefs.has(ref) || stale.has(ref)) && !frozenRefs.has(ref);
        });

        for (const c of unified) {
            const project = projects.get(c.project_id);
            const base = { ref: c.ref, date: c.date, autonomous: c.autonomous, evidence: c.evidence, unified: c.unified ?? [] };
            const rawMinutes = workedMinutes(c.segments);
            let segs = c.segments;
            let allowOverlap = false;
            const unifiedNote = c.unified?.length ? ` (hora unificada con ${c.unified.map((u) => u.project).join(", ")})` : "";
            const notes = c.unified?.length ? [`unificada con ${c.unified.map((u) => u.project).join(", ")} (mismo cliente, en paralelo)`] : [];

            // La API no deja superponer el mismo proyecto, sea autónomo o no.
            const timer = suspicious.find((s) => s.project.id === c.project_id && segmentsIntersect(segs, s.segs));
            if (timer) {
                doubts.push({ ...base, kind: "choca_con_timer", project, ...toEntryTimes(segs),
                    message: `"${project.name}"${unifiedNote} tiene ${workedMinutes(segs)} min de actividad, pero se cruza con ${describe(timer.entry)} del mismo proyecto, que parece un timer olvidado: no lo cargué.` });
                continue;
            }
            if (suspicious.some((s) => segmentsIntersect(segs, s.segs))) allowOverlap = true;

            const orphan = orphans.find((o) => o.project.id !== c.project_id && segmentsIntersect(segs, o.segs));
            if (orphan) {
                doubts.push({ ...base, kind: "hora_huerfana", project, ...toEntryTimes(segs),
                    message: `"${project.name}"${unifiedNote} tiene ${workedMinutes(segs)} min de actividad, pero se cruza con ${describe(orphan.entry)}, que cargó este agente y ya no tiene actividad propia (¿se remapeó la carpeta?). No lo cargué para no cobrar dos veces: corregí o borrá esa hora.` });
                continue;
            }

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
                        message: `"${project.name}"${unifiedNote} ya tiene horas cargadas a mano ese día (${already.join("; ")}), pero hay ${workedMinutes(rest)} min de actividad fuera de ellas.` });
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
    };

    // Una hora propia ajustable cuya candidata no llega a ser una entrada (quedó en menos de 30 min
    // o en duda, p. ej. porque se remapeó la carpeta) no puede quedar cobrando ese tiempo en paralelo
    // con otra: se resuelve otra vez tratándola como huérfana, y queda una duda sobre ella.
    const first = solve(new Set());
    const stale = new Set(unified
        .filter((c) => !first.entries.some((e) => e.ref === c.ref) && !frozenRefs.has(c.ref) && existing.some((x) => x.external_ref === c.ref))
        .map((c) => c.ref));
    const result = stale.size ? solve(stale) : first;
    for (const ref of stale) {
        const e = existing.find((x) => x.external_ref === ref);
        result.doubts.push({ kind: "hora_propia_sin_actividad", ref: `existente:${e.id}`, date: window.date ?? null, entry_id: e.id, project: projectOf(e),
            message: `La hora ${describe(e)} que cargó este agente ya no tiene ${MIN_WORKED_MIN} min de actividad propia (¿se remapeó la carpeta?): ¿la achico o la borro?` });
    }
    return { entries: result.entries, discarded: [...discarded, ...result.discarded], doubts: [...doubts, ...result.doubts] };
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

/** La hora cargada es exactamente esta (proyecto, clase, inicio, fin y pausas): se puede adoptar. */
export const matchesEntry = (current, segments, projectId, autonomous) =>
    current.project.id === projectId && Boolean(current.autonomous) === Boolean(autonomous) && sameTimes(current, segments);

/** El registro local de una ref, salvo que sea solo la marca de "unificada en otra" (no es propio). */
export const ownRecord = (rec) => (rec?.member_of ? undefined : rec);

/**
 * Qué hacer con un proyecto que el agente ya cargó unificado en otra hora (`rec.member_of`):
 * - la hora principal se borró → se descarta (no vuelve sola);
 * - la principal sigue ajustable → es candidata (se vuelve a unificar);
 * - la principal se editó o se facturó → se respeta: solo lo NUEVO (fuera de esa hora y de lo que
 *   cubría al unificarse, `rec.span`) puede ser una duda si llega a 30 min.
 */
export function memberFate({ main, mainRec, rec, segments, now }) {
    if (!main) return { fate: "discard", reason: "borraste la hora en la que iba unificada" };
    const frozen = frozenReason(main, ownRecord(mainRec));
    if (!frozen) return { fate: "candidate" };
    const rest = subtractSegments(segments, [...entrySegments(main, now), ...(rec?.span ? [rec.span] : [])]);
    return workedMinutes(rest) >= MIN_WORKED_MIN ? { fate: "doubt", rest, frozen } : { fate: "discard", reason: `iba unificada en una hora que quedó así: ${frozen}; la respeto` };
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
    // Las sesiones en un worktree abren con un <system-reminder> pegado al pedido real.
    const text = (userText(entry) ?? "").replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
    if (!text || text.startsWith("<") || /^(Another Claude session|\[Cross-session|\[Request interrupted|\[Image|\(Re-invocation|This session is being continued|Base directory for this skill|The app was quit while you were working)/.test(text)) return null;
    return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Prefijo de los avisos de dudas del agente (doubtText en sync.mjs). */
export const DOUBT_PREFIX = "[Agente de horas de MyKimai]";

/**
 * Subcomandos de una línea de shell que se EJECUTAN (sin el cuerpo de un heredoc ni lo que sigue a
 * `<<`, que es contenido, no un comando).
 */
function shellCommands(command) {
    const lines = String(command ?? "").split("\n");
    const head = [];
    for (const line of lines) {
        const i = line.indexOf("<<");
        head.push(i >= 0 ? line.slice(0, i) : line);
        if (i >= 0) break;
    }
    return head.join("\n").split(/&&|\|\||;|\||\n/).map((s) => s.trim()).filter(Boolean);
}

/** `node <ruta>/cerrar-jornada/scripts/(sync|jornada).mjs …` como comando (no como argumento de otro). */
const runsAgent = (cmd) => {
    const tokens = cmd.split(/\s+/).map((t) => t.replace(/^["']|["']$/g, ""));
    if (!/^node(\.exe)?$/i.test(tokens[0] ?? "")) return false;
    const at = tokens.findIndex((t, i) => i > 0 && !t.startsWith("-"));
    // Flags de node antes del script que no lo ejecutan (chequear sintaxis, evaluar, leer stdin).
    const flags = tokens.slice(1, at < 0 ? undefined : at);
    return at > 0 && flags.every((t) => !/^(-e|--eval|-p|--print|--check|-c|-)$/.test(t)) &&
        /cerrar-jornada[\\/]scripts[\\/](sync|jornada)\.mjs$/.test(tokens[at]);
};

/**
 * Uso de herramienta que es administración de horas: EJECUTAR el agente o el cierre de jornada,
 * las herramientas de MyKimai, mandar el aviso de una duda, el skill cerrar-jornada y su
 * procedimiento instalado, o leer/escribir los archivos de ~/.mykimai (mapa, plan, dudas).
 * Desarrollar el agente (editar, buscar, chequear o commitear su código) no lo es.
 */
export function isBillingToolUse(use) {
    const input = use.input ?? {};
    if (/^mcp__mykimai__/.test(use.name)) return true;
    // De las herramientas de sesiones, solo el aviso de una duda: con las demás Lucas también
    // coordina trabajo de clientes (son neutras: caen adentro del bloque del reparto si lo hay).
    if (use.name === "mcp__ccd_session_mgmt__send_message") return String(input.message ?? "").includes(DOUBT_PREFIX);
    if (use.name === "Skill") return /cerrar-jornada/.test(String(input.skill ?? ""));
    if (use.name === "ToolSearch") return /mykimai/.test(String(input.query ?? ""));
    if (use.name === "Bash" || use.name === "PowerShell") {
        return shellCommands(input.command).some((cmd) =>
            runsAgent(cmd) || (!/^(git|grep|rg|sed|awk|find|ls|echo|node|python3?)\b/.test(cmd) && /[\\/]\.mykimai[\\/]/i.test(cmd)));
    }
    const path = String(input.file_path ?? input.path ?? input.notebook_path ?? "");
    if (/[\\/]\.mykimai[\\/]/i.test(path)) return true;
    return (use.name === "Read" || use.name === "Grep") && /[\\/]\.claude[\\/]skills[\\/]cerrar-jornada[\\/](AGENTE|SKILL)\.md$/i.test(path);
}

/**
 * Herramientas que no dicen qué se está haciendo: ni empiezan trabajo ni cortan un bloque de
 * administración (las de sesiones de Claude Desktop, salvo el aviso de una duda, también).
 */
const isNeutralTool = (use) => ["ToolSearch", "TodoWrite"].includes(use.name) || /^mcp__(ccd_session_mgmt|ccd_sidebar)__/.test(use.name);

/**
 * Clase de un evento de la sesión principal para `adminMask`: `prompt` (un mensaje del usuario, o
 * de otra sesión que no es un aviso de duda, abre un turno), `cross` (el aviso de una duda del
 * agente abre un turno), u `other`; `billing` si el asistente usó una herramienta de administración
 * de horas, `tool` si usó una de trabajo.
 */
export function turnEvent(entry) {
    if (entry.type === "user") {
        const text = userText(entry);
        // Los mensajes entre sesiones llegan como isMeta con origin "peer"; las devoluciones de
        // subagentes (con senderTaskId) son parte del turno.
        const peer = !entry.origin?.senderTaskId && (entry.origin?.kind === "peer" || /<cross-session-message|^\s*Another Claude session/.test(text ?? ""));
        if (peer) return { kind: (text ?? "").includes(DOUBT_PREFIX) ? "cross" : "prompt", billing: false, tool: false };
        if (!entry.isMeta && text !== null) return { kind: "prompt", billing: false, tool: false };
    }
    const uses = entry.type === "assistant" && Array.isArray(entry.message?.content)
        ? entry.message.content.filter((x) => x.type === "tool_use")
        : [];
    const billing = uses.some(isBillingToolUse);
    const tool = uses.some((u) => !isBillingToolUse(u) && !isNeutralTool(u));
    return { kind: "other", billing, tool: tool && !billing };
}

/**
 * Qué eventos de una sesión NO son trabajo para el cliente (true = se descarta):
 * - el turno que abre el aviso de una duda del agente (el aviso y lo que responde Claude), hasta
 *   que se retoma el trabajo (una herramienta de trabajo, p. ej. un cron que sigue);
 * - cada bloque de administración de horas: desde una herramienta de ese tipo hasta la próxima
 *   herramienta de trabajo (resolver una duda, repartirlas, cerrar la jornada). Si el turno arranca
 *   directamente con eso, también el prompt. El trabajo del turno antes, entre o después cuenta.
 */
export function adminMask(events) {
    const mask = events.map(() => false);
    const flush = (start, end) => {
        if (start >= end) return;
        let i = start;
        let workSeen = false;
        if (events[start].kind === "cross") {
            while (i < end && !events[i].tool) mask[i++] = true;
            workSeen = i < end;
        }
        let inBlock = false;
        for (; i < end; i++) {
            const e = events[i];
            if (e.billing) {
                // Un turno que arranca con administración: el prompt también es administración.
                if (!workSeen && !inBlock) for (let j = start; j < i; j++) mask[j] = true;
                inBlock = true;
            } else if (e.tool) {
                inBlock = false;
                workSeen = true;
            }
            if (inBlock) mask[i] = true;
        }
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
export function agentTaskText(text, maxLen = 200) {
    const t = String(text ?? "").trim();
    if (!t.startsWith("[Workflow harness")) return t.replace(/\s+/g, " ").slice(0, maxLen) || null;
    if (!/^\[Workflow harness[^\]]*computed task\]/.test(t)) return null;
    const nl = t.indexOf("\n");
    return nl < 0 ? null : t.slice(nl + 1).replace(/\s+/g, " ").trim().slice(0, maxLen) || null;
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

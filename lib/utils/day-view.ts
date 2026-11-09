/**
 * Vista "Day" de Mis Horas: un día (hora Argentina) con una fila por
 * cliente/proyecto y una línea de tiempo compartida.
 *
 * Lógica pura (sin React ni Prisma) para poder testearla. Los instantes van en
 * milisegundos epoch; el día se identifica con su clave yyyy-MM-dd en hora AR.
 */

import { fromZonedTime } from "date-fns-tz";
import { AR_TZ } from "@/lib/timezone";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

type When = Date | string | number;
const ms = (d: When): number => new Date(d).getTime();

/** Inicio y fin (exclusivo) del día AR `yyyy-MM-dd`, como instantes UTC en ms. */
export function arDayBounds(dayKey: string): { start: number; end: number } {
    const start = fromZonedTime(`${dayKey}T00:00:00`, AR_TZ).getTime();
    const end = fromZonedTime(`${shiftDayKey(dayKey, 1)}T00:00:00`, AR_TZ).getTime();
    return { start, end };
}

/** Corre una clave de día `yyyy-MM-dd` n días (negativo = hacia atrás). */
export function shiftDayKey(dayKey: string, days: number): string {
    const [y, m, d] = dayKey.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
    return t.toISOString().slice(0, 10);
}

export interface Interval {
    start: number;
    end: number;
}

export interface EntryLike {
    start_time: When;
    end_time: When | null;
    time_entry_breaks?: { id?: string; start_time: When; end_time: When | null }[] | null;
}

/**
 * Qué representa cada extremo de un tramo trabajado: el inicio o el fin de la
 * tarea, o el inicio o el fin de una pausa. Es lo que cambia al arrastrarlo.
 */
export type EdgeRef =
    | { kind: "entry-start" }
    | { kind: "entry-end" }
    | { kind: "break-start"; breakId: string }
    | { kind: "break-end"; breakId: string };

export interface TaggedSegment extends Interval {
    /** null = no se puede mover (lo recorta el día, o es "ahora"). */
    startEdge: EdgeRef | null;
    endEdge: EdgeRef | null;
}

/**
 * Tramos trabajados con lo que representa cada extremo. Mismo cálculo que
 * `workedSegments`: [inicio, fin] menos las pausas; lo abierto corre hasta `now`.
 */
export function taggedSegments(entry: EntryLike, now: number, window?: Interval): TaggedSegment[] {
    let start = ms(entry.start_time);
    let end = entry.end_time ? ms(entry.end_time) : Math.max(now, start);
    let startEdge: EdgeRef | null = { kind: "entry-start" };
    let endEdge: EdgeRef | null = entry.end_time ? { kind: "entry-end" } : null;
    if (window) {
        if (window.start > start) {
            start = window.start;
            startEdge = null;
        }
        if (window.end < end) {
            end = window.end;
            endEdge = null;
        }
    }
    if (end <= start) return [];

    const breaks = (entry.time_entry_breaks ?? [])
        .map((b) => ({
            id: b.id ?? null,
            start: ms(b.start_time),
            end: b.end_time ? ms(b.end_time) : now,
            open: !b.end_time,
        }))
        .filter((b) => b.end > b.start)
        .sort((a, b) => a.start - b.start);

    const out: TaggedSegment[] = [];
    let cursor = start;
    let cursorEdge: EdgeRef | null = startEdge;
    for (const b of breaks) {
        if (b.end <= cursor) continue;
        if (b.start >= end) break;
        if (b.start > cursor) {
            out.push({
                start: cursor,
                end: b.start,
                startEdge: cursorEdge,
                endEdge: b.id ? { kind: "break-start", breakId: b.id } : null,
            });
        }
        cursor = b.end;
        cursorEdge = b.id && !b.open ? { kind: "break-end", breakId: b.id } : null;
        if (cursor >= end) break;
    }
    if (cursor < end) out.push({ start: cursor, end, startEdge: cursorEdge, endEdge });
    return out;
}

/**
 * Tramos TRABAJADOS de una entrada: [inicio, fin] menos las pausas. Una entrada
 * o pausa abierta corre hasta `now`. Si se pasa `window`, se recortan a ella.
 */
export function workedSegments(entry: EntryLike, now: number, window?: Interval): Interval[] {
    return taggedSegments(entry, now, window).map(({ start, end }) => ({ start, end }));
}

const MIN_MS = 60_000;

const sameEdge = (a: EdgeRef | null, b: EdgeRef) =>
    !!a && a.kind === b.kind && ("breakId" in a ? a.breakId === (b as { breakId: string }).breakId : true);

/**
 * Hasta dónde se puede arrastrar un extremo sin que un tramo quede vacío ni se
 * dé vuelta: siempre queda al menos un minuto de trabajo y de pausa.
 * `neighbors` son las otras tareas del mismo proyecto, que no se pisan entre sí.
 * Devuelve null si el extremo no está en el día o no se puede mover.
 */
export function edgeLimits(
    entry: EntryLike,
    edge: EdgeRef,
    now: number,
    window: Interval,
    neighbors: Interval[] = []
): Interval | null {
    const segs = taggedSegments(entry, now, window);
    const brk = (id: string) => {
        const b = (entry.time_entry_breaks ?? []).find((x) => x.id === id);
        return b ? { start: ms(b.start_time), end: b.end_time ? ms(b.end_time) : null } : null;
    };

    switch (edge.kind) {
        case "entry-start": {
            const seg = segs.find((s) => sameEdge(s.startEdge, edge));
            if (!seg) return null;
            const min = Math.max(window.start, ...neighbors.filter((n) => n.end <= seg.start).map((n) => n.end));
            return { start: min, end: seg.end - MIN_MS };
        }
        case "entry-end": {
            const seg = segs.find((s) => sameEdge(s.endEdge, edge));
            if (!seg) return null;
            const max = Math.min(window.end, now, ...neighbors.filter((n) => n.start >= seg.end).map((n) => n.start));
            return { start: seg.start + MIN_MS, end: Math.max(seg.start + MIN_MS, max) };
        }
        case "break-start": {
            const seg = segs.find((s) => sameEdge(s.endEdge, edge));
            const b = brk(edge.breakId);
            if (!seg || !b) return null;
            return { start: seg.start + MIN_MS, end: (b.end ?? now) - MIN_MS };
        }
        case "break-end": {
            const seg = segs.find((s) => sameEdge(s.startEdge, edge));
            const b = brk(edge.breakId);
            if (!seg || !b || b.end === null) return null;
            return { start: b.start + MIN_MS, end: seg.end - MIN_MS };
        }
    }
}

/** La entrada con un extremo movido a `t` (vista previa al arrastrar). */
export function applyEdge<E extends EntryLike>(entry: E, edge: EdgeRef, t: number): E {
    const at = new Date(t);
    switch (edge.kind) {
        case "entry-start":
            return { ...entry, start_time: at };
        case "entry-end":
            return { ...entry, end_time: at };
        case "break-start":
        case "break-end": {
            const field = edge.kind === "break-start" ? "start_time" : "end_time";
            return {
                ...entry,
                time_entry_breaks: (entry.time_entry_breaks ?? []).map((b) =>
                    b.id === edge.breakId ? { ...b, [field]: at } : b
                ),
            };
        }
    }
}

/**
 * Valida mover un extremo a `t` (lo usa el servidor antes de guardar): la tarea
 * termina después de empezar y no en el futuro, y cada pausa queda dentro de la
 * tarea con su inicio antes del fin. Devuelve el motivo del rechazo, o null.
 */
export function edgeMoveError(entry: EntryLike, edge: EdgeRef, t: number, now: number): string | null {
    if (edge.kind === "entry-end" && !entry.end_time) return "La tarea sigue en curso.";
    if (edge.kind === "break-start" || edge.kind === "break-end") {
        const b = (entry.time_entry_breaks ?? []).find((x) => x.id === edge.breakId);
        if (!b) return "Pausa no encontrada.";
        if (edge.kind === "break-end" && !b.end_time) return "La pausa sigue en curso.";
    }
    const next = applyEdge(entry, edge, t);
    const start = ms(next.start_time);
    const end = next.end_time ? ms(next.end_time) : null;
    if (t > now + MIN_MS) return "No se puede mover al futuro.";
    if (end !== null && end <= start) return "La tarea tiene que terminar después de empezar.";
    for (const b of next.time_entry_breaks ?? []) {
        const bs = ms(b.start_time);
        const be = b.end_time ? ms(b.end_time) : null;
        if (be !== null && be <= bs) return "La pausa tiene que terminar después de empezar.";
        if (bs < start) return "Una pausa no puede empezar antes que la tarea.";
        if (end !== null && be !== null && be > end) return "Una pausa no puede terminar después que la tarea.";
    }
    return null;
}

/**
 * Instante al soltar: pegado a la marca más cercana (inicio o fin de otra
 * tarea) si está a menos de `threshold` ms; si no, redondeado al minuto.
 */
export function snapTime(t: number, candidates: number[], threshold: number): number {
    let best: number | null = null;
    for (const c of candidates) {
        if (Math.abs(c - t) <= threshold && (best === null || Math.abs(c - t) < Math.abs(best - t))) best = c;
    }
    return best ?? Math.round(t / MIN_MS) * MIN_MS;
}

/**
 * Rango del eje: exactamente del primer inicio al último fin trabajado del día,
 * sin las horas vacías de antes y de después. Sin trabajo, 07:00–19:00.
 */
export function dayAxis(segments: Interval[], dayStart: number): Interval {
    if (segments.length === 0) {
        return { start: dayStart + 7 * HOUR_MS, end: dayStart + 19 * HOUR_MS };
    }
    const start = Math.min(...segments.map((s) => s.start));
    const end = Math.max(...segments.map((s) => s.end));
    // Un rango de largo cero no se puede dibujar.
    return { start, end: end > start ? end : start + 60_000 };
}

/** Posición (0–100 %) de un instante en el eje. */
export function axisPercent(t: number, axis: Interval): number {
    const span = axis.end - axis.start;
    if (span <= 0) return 0;
    return Math.max(0, Math.min(100, ((t - axis.start) / span) * 100));
}

/**
 * Horas en punto que caen dentro del eje (para las marcas de fondo y sus
 * etiquetas). Con más de 12 h de rango, una cada dos horas (las pares).
 */
export function hourTicks(axis: Interval, dayStart: number): { t: number; hour: number }[] {
    const step = axis.end - axis.start > 12 * HOUR_MS ? 2 : 1;
    const out: { t: number; hour: number }[] = [];
    for (let h = Math.ceil((axis.start - dayStart) / HOUR_MS); dayStart + h * HOUR_MS <= axis.end; h++) {
        if (h % step === 0) out.push({ t: dayStart + h * HOUR_MS, hour: h });
    }
    return out;
}

/** Instantes (sin repetir, ordenados) donde empieza o termina cada tarea: las líneas de puntos. */
export function boundaryMarks(entries: Interval[]): number[] {
    const set = new Set<number>();
    for (const e of entries) {
        set.add(Math.floor(e.start / 60000) * 60000);
        set.add(Math.floor(e.end / 60000) * 60000);
    }
    return Array.from(set).sort((a, b) => a - b);
}

export interface RowEntry {
    id: string;
    start_time: When;
    projectId: string;
    projectName: string;
    clientName: string;
}

export interface DayRow<E> {
    projectId: string;
    projectName: string;
    clientName: string;
    entries: E[];
}

/** Una fila por proyecto, en el orden en que arrancó la primera tarea de cada uno. */
export function groupRowsByProject<E extends RowEntry>(entries: E[]): DayRow<E>[] {
    const sorted = [...entries].sort((a, b) => ms(a.start_time) - ms(b.start_time));
    const rows = new Map<string, DayRow<E>>();
    for (const e of sorted) {
        let row = rows.get(e.projectId);
        if (!row) {
            row = { projectId: e.projectId, projectName: e.projectName, clientName: e.clientName, entries: [] };
            rows.set(e.projectId, row);
        }
        row.entries.push(e);
    }
    return Array.from(rows.values());
}

/** Totales de la jornada: minutos netos y monto agrupado por moneda. */
export function dayTotals(
    items: { netoMin: number; amount: number; currency: string }[]
): { netoMin: number; byCurrency: { currency: string; amount: number }[] } {
    let netoMin = 0;
    const byCurrency = new Map<string, number>();
    for (const it of items) {
        netoMin += it.netoMin;
        byCurrency.set(it.currency, (byCurrency.get(it.currency) ?? 0) + it.amount);
    }
    return {
        netoMin,
        byCurrency: Array.from(byCurrency, ([currency, amount]) => ({ currency, amount })).sort((a, b) =>
            a.currency.localeCompare(b.currency)
        ),
    };
}

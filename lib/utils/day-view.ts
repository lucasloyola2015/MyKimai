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
    time_entry_breaks?: { start_time: When; end_time: When | null }[] | null;
}

/**
 * Tramos TRABAJADOS de una entrada: [inicio, fin] menos las pausas. Una entrada
 * o pausa abierta corre hasta `now`. Si se pasa `window`, se recortan a ella.
 */
export function workedSegments(entry: EntryLike, now: number, window?: Interval): Interval[] {
    let start = ms(entry.start_time);
    let end = entry.end_time ? ms(entry.end_time) : Math.max(now, start);
    if (window) {
        start = Math.max(start, window.start);
        end = Math.min(end, window.end);
    }
    if (end <= start) return [];

    const breaks = (entry.time_entry_breaks ?? [])
        .map((b) => ({ start: ms(b.start_time), end: b.end_time ? ms(b.end_time) : now }))
        .filter((b) => b.end > b.start)
        .sort((a, b) => a.start - b.start);

    const out: Interval[] = [];
    let cursor = start;
    for (const b of breaks) {
        if (b.end <= cursor) continue;
        if (b.start >= end) break;
        if (b.start > cursor) out.push({ start: cursor, end: b.start });
        cursor = Math.max(cursor, b.end);
        if (cursor >= end) break;
    }
    if (cursor < end) out.push({ start: cursor, end });
    return out;
}

export const DAY_AXIS_DEFAULT_FROM = 7;
export const DAY_AXIS_MIN_SPAN = 4;

/**
 * Rango de horas del eje (relativas al inicio del día): arranca a las 07:00
 * salvo que algo empiece antes, y termina en la hora en punto siguiente al
 * último fin (mínimo 4 h de ancho, nunca después de las 24).
 */
export function dayAxis(segments: Interval[], dayStart: number): { fromHour: number; toHour: number } {
    if (segments.length === 0) {
        return { fromHour: DAY_AXIS_DEFAULT_FROM, toHour: DAY_AXIS_DEFAULT_FROM + DAY_AXIS_MIN_SPAN * 3 };
    }
    const first = Math.min(...segments.map((s) => s.start));
    const last = Math.max(...segments.map((s) => s.end));
    const fromHour = Math.max(0, Math.min(DAY_AXIS_DEFAULT_FROM, Math.floor((first - dayStart) / HOUR_MS)));
    const lastHour = Math.ceil((last - dayStart) / HOUR_MS);
    const toHour = Math.min(24, Math.max(lastHour, fromHour + DAY_AXIS_MIN_SPAN));
    return { fromHour, toHour };
}

/** Posición (0–100 %) de un instante en el eje. */
export function axisPercent(t: number, dayStart: number, fromHour: number, toHour: number): number {
    const from = dayStart + fromHour * HOUR_MS;
    const span = (toHour - fromHour) * HOUR_MS;
    if (span <= 0) return 0;
    return Math.max(0, Math.min(100, ((t - from) / span) * 100));
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

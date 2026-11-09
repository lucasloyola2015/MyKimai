/**
 * Rango de fechas del listado de Mis Horas (vista LIST).
 *
 * Lógica pura para poder testearla. Los días son claves `yyyy-MM-dd` en hora
 * Argentina; "hasta" incluye el día completo. Sin rango, el listado muestra los
 * últimos 90 días (o todo el historial si se pide).
 */

import { arDayBounds, shiftDayKey } from "@/lib/utils/day-view";

export const LIST_DEFAULT_WINDOW_DAYS = 90;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface DayRange {
    /** yyyy-MM-dd (AR) o "" = sin límite. */
    from: string;
    to: string;
}

export type QuickRangeKey = "today" | "week" | "month" | "last_month";

const pad = (n: number) => String(n).padStart(2, "0");

/** Rangos rápidos a partir del día de hoy (AR). La semana arranca el lunes. */
export function quickRanges(today: string): { key: QuickRangeKey; label: string; from: string; to: string }[] {
    const [y, m, d] = today.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
    const monday = shiftDayKey(today, -((weekday + 6) % 7));
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    const lastDayPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return [
        { key: "today", label: "Hoy", from: today, to: today },
        { key: "week", label: "Esta semana", from: monday, to: today },
        { key: "month", label: "Este mes", from: `${y}-${pad(m)}-01`, to: today },
        { key: "last_month", label: "Mes pasado", from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDayPrev)}` },
    ];
}

/** El rango tiene al menos un extremo y, si tiene los dos, no está invertido. */
export function rangeError(range: DayRange): string | null {
    for (const v of [range.from, range.to]) {
        if (v && !DAY_KEY.test(v)) return "Fecha inválida";
    }
    if (range.from && range.to && range.from > range.to) return "\"Desde\" es posterior a \"Hasta\"";
    return null;
}

/**
 * Instantes para la consulta del listado. Con un rango válido manda el rango
 * (aunque salga de la ventana de 90 días); si no, la ventana por defecto o,
 * con `showAll`, sin límite.
 */
export function listDateBounds(
    range: DayRange,
    showAll: boolean,
    now: number
): { startDate?: Date; endDate?: Date } {
    if ((range.from || range.to) && !rangeError(range)) {
        return {
            startDate: range.from ? new Date(arDayBounds(range.from).start) : undefined,
            endDate: range.to ? new Date(arDayBounds(range.to).end - 1) : undefined,
        };
    }
    if (showAll) return {};
    return { startDate: new Date(now - LIST_DEFAULT_WINDOW_DAYS * 86_400_000) };
}

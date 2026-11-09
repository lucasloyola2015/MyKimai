/**
 * Horario de una tarea cargada a mano (botón + de Mis Horas): un día AR y dos
 * horas HH:mm. Si el fin es igual o anterior al inicio, la tarea termina al
 * día siguiente (ej. 22:00–00:30).
 */

import { fromZonedTime } from "date-fns-tz";
import { AR_TZ } from "@/lib/timezone";
import { shiftDayKey } from "@/lib/utils/day-view";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ManualEntryTimes =
    | { ok: true; start: Date; end: Date; nextDay: boolean; minutes: number }
    | { ok: false; error: string };

export function manualEntryTimes(dayKey: string, start: string, end: string): ManualEntryTimes {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return { ok: false, error: "Elegí la fecha." };
    if (!HHMM.test(start) || !HHMM.test(end)) return { ok: false, error: "Completá el inicio y el fin (HH:mm)." };
    const nextDay = end <= start;
    const s = fromZonedTime(`${dayKey}T${start}:00`, AR_TZ);
    const e = fromZonedTime(`${nextDay ? shiftDayKey(dayKey, 1) : dayKey}T${end}:00`, AR_TZ);
    return { ok: true, start: s, end: e, nextDay, minutes: Math.round((e.getTime() - s.getTime()) / 60000) };
}

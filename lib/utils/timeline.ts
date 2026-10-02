/**
 * Hora de arranque de la línea de tiempo diaria (Mis Horas): por defecto las 07:00, para no mostrar
 * la madrugada vacía; si ese día alguna entrada empieza antes, arranca en la hora en punto de la
 * más temprana. Todas las entradas de un mismo día comparten la misma escala.
 *
 * Las claves son el día en hora LOCAL (yyyy-MM-dd), igual que DayTimeline (startOfDay local).
 */
export const DEFAULT_TIMELINE_START_HOUR = 7;

export function dayKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function timelineStartHourByDay(
    starts: Date[],
    defaultHour: number = DEFAULT_TIMELINE_START_HOUR
): Map<string, number> {
    const byDay = new Map<string, number>();
    for (const s of starts) {
        const key = dayKey(s);
        const hour = Math.min(s.getHours(), byDay.get(key) ?? defaultHour);
        byDay.set(key, hour);
    }
    return byDay;
}

/**
 * Helpers de duración para el sistema de time tracking.
 *
 * **Unidad canónica:** todas las funciones de este módulo y las columnas
 * `time_entries.duration_total` / `time_entries.duration_neto` operan en
 * **minutos enteros**. No mezclar con segundos ni con horas decimales sin
 * conversión explícita (ver §4.4 IMPROVEMENT_PLAN).
 *
 * - `duration_total`: minutos brutos entre `start_time` y `end_time`.
 * - `duration_neto` = `duration_total` − suma de minutos de pausas.
 *
 * Ambos campos los calcula y mantiene la base de datos vía triggers
 * (ver Harden Finance / migrate-duration-neto). El cliente solo lee.
 */

/**
 * Formatea una duración en minutos como `HH:mm` con padding a 2 dígitos.
 *
 * Ejemplos:
 * - `formatDurationMinutes(0)`   → `"00:00"`
 * - `formatDurationMinutes(45)`  → `"00:45"`
 * - `formatDurationMinutes(125)` → `"02:05"`
 * - `formatDurationMinutes(605)` → `"10:05"`
 *
 * Si el valor es negativo o null/undefined, devuelve `"00:00"`.
 */
export function formatDurationMinutes(
    minutes: number | null | undefined
): string {
    if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
        return "00:00";
    }
    const totalMinutes = Math.floor(minutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
        .toString()
        .padStart(2, "0")}`;
}

/**
 * Convierte una duración en minutos a horas decimales (para cálculos de
 * facturación: `amount = rate * decimalHours`).
 *
 * Ejemplo: `minutesToDecimalHours(90)` → `1.5`.
 */
export function minutesToDecimalHours(
    minutes: number | null | undefined
): number {
    if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
        return 0;
    }
    return minutes / 60;
}

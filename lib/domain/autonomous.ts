/**
 * Trabajo autónomo de agentes (lógica pura → testeable).
 *
 * Lo que un agente hace solo (típicamente de madrugada, 01:00–07:00) se carga en una tarea aparte
 * de cada proyecto, "Trabajo autónomo", con su propia tarifa con descuento. La cascada de tarifas
 * (tarea > proyecto > cliente, ver lib/utils/rates.ts) hace el resto: si la tarea tiene precio usa
 * ese; si no lo tiene, cae al del proyecto o al del cliente.
 */

export const AUTONOMOUS_TASK_NAME = "Trabajo autónomo";
/** Descuento por defecto al crear la tarea autónoma de un proyecto. */
export const AUTONOMOUS_DISCOUNT = 0.5;
const PREFIX = `${AUTONOMOUS_TASK_NAME}: `;

export const isAutonomousTask = (taskName: string | null | undefined): boolean =>
    (taskName ?? "").trim().toLowerCase() === AUTONOMOUS_TASK_NAME.toLowerCase();

/** Título con el prefijo "Trabajo autónomo: " (sin duplicarlo), dentro de los 255 caracteres. */
export function autonomousTitle(title: string): string {
    const t = title.trim();
    if (t.toLowerCase().startsWith(AUTONOMOUS_TASK_NAME.toLowerCase())) return t.slice(0, 255);
    return (PREFIX + t).slice(0, 255);
}

/**
 * Precio de la tarea autónoma: la tarifa efectiva del proyecto (proyecto, si no cliente) con el
 * descuento aplicado. null si no hay tarifa de referencia: la cascada resolverá con la del cliente.
 */
export function discountedRate(effectiveRate: number | null, discount: number = AUTONOMOUS_DISCOUNT): number | null {
    if (effectiveRate == null) return null;
    return Math.round(effectiveRate * (1 - discount) * 100) / 100;
}

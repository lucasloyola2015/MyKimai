/**
 * Totales "en vivo" de una entrada de Mis Horas (vistas LIST y Day).
 *
 * Completadas: usa lo persistido (duraciones y `amount` los calcula el trigger
 * de la DB). Activas (sin end_time): se calcula en vivo para mostrar, sin
 * persistir nada.
 */

/**
 * Bruto/Pausas/Neto en MINUTOS. Activa: bruto = ahora − inicio; pausas = suma
 * de pausas (la abierta corre hasta ahora); neto = bruto − pausas.
 */
export function liveTotals(entry: any, now: number): { bruto: number; pausas: number; neto: number } {
  if (entry.end_time) {
    const bruto = entry.duration_total || 0;
    const neto = entry.duration_neto || 0;
    return { bruto, pausas: Math.max(0, bruto - neto), neto };
  }
  const start = new Date(entry.start_time).getTime();
  const brutoMs = Math.max(0, now - start);
  let pausasMs = 0;
  for (const b of entry.time_entry_breaks ?? []) {
    const bs = new Date(b.start_time).getTime();
    const be = b.end_time ? new Date(b.end_time).getTime() : now;
    pausasMs += Math.max(0, be - bs);
  }
  pausasMs = Math.min(pausasMs, brutoMs);
  return {
    bruto: Math.floor(brutoMs / 60000),
    pausas: Math.floor(pausasMs / 60000),
    neto: Math.max(0, Math.floor((brutoMs - pausasMs) / 60000)),
  };
}

/** Tarifa efectiva por hora de una entrada: cascada Tarea > Proyecto > Cliente
 * (mismos `!= null` que resolveRate; un 0 explícito es una tarifa válida). */
export function resolveEntryRate(entry: any): number {
  const task = entry.tasks;
  const project = task?.projects;
  const client = project?.clients;
  const r = task?.rate ?? project?.rate ?? client?.default_rate ?? 0;
  return Number(r) || 0;
}

/** Inversión (monto) de la entrada. Completada: usa el `amount` persistido (lo
 * calcula el trigger). Activa: lo calcula en vivo = (neto/60) * tarifa, salvo que
 * no sea facturable. */
export function liveAmount(entry: any, netoMin: number): number {
  if (entry.end_time) return Number(entry.amount || 0);
  if (!entry.billable) return 0;
  return (netoMin / 60) * resolveEntryRate(entry);
}

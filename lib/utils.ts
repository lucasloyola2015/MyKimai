import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calcula la duración neta en minutos restando las pausas del intervalo total.
 * Regla de Ingeniería: Horas Facturables = (Hora Fin - Hora Inicio) - Tiempo Total de Pausas
 */
export function calculateNetDurationMinutes(
  startTime: Date,
  endTime: Date | null,
  breaks: { start_time: Date; end_time: Date | null }[]
): number {
  if (!endTime) return 0;

  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;

  // Duración bruta en milisegundos
  const grossMs = end.getTime() - start.getTime();

  // Sumatoria de pausas en milisegundos
  const breaksMs = (breaks || []).reduce((total, b) => {
    const bStart = (typeof b.start_time === 'string' ? new Date(b.start_time) : b.start_time).getTime();
    const bEndRaw = b.end_time || end;
    const bEnd = (typeof bEndRaw === 'string' ? new Date(bEndRaw) : bEndRaw).getTime();

    // Solo contar pausas que estén dentro del intervalo del entry (por seguridad)
    const effectiveStart = Math.max(bStart, start.getTime());
    const effectiveEnd = Math.min(bEnd, end.getTime());

    if (effectiveEnd > effectiveStart) {
      return total + (effectiveEnd - effectiveStart);
    }
    return total;
  }, 0);

  const netMs = Math.max(0, grossMs - breaksMs);
  return Math.round(netMs / 60000);
}

/**
 * Unifica el cálculo de duración y monto para un entry.
 * Usado tanto en el admin como en el portal para garantizar consistencia.
 */
export function computeEntryTotals(entry: {
  start_time: Date;
  end_time: Date | null;
  breaks?: { start_time: Date; end_time: Date | null }[];
  rate_applied: any;
}) {
  const netMinutes = calculateNetDurationMinutes(
    entry.start_time,
    entry.end_time,
    entry.breaks || []
  );
  const rate = Number(entry.rate_applied || 0);
  const amount = Number(((netMinutes / 60) * rate).toFixed(2));

  return {
    duration_minutes: netMinutes,
    amount: amount
  };
}

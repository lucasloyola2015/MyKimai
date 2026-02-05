import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { startOfDay } from "date-fns";

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

/**
 * Obtiene intervalos de trabajo netos (excluyendo pausas) para un entry.
 * Útil para distribuir minutos por hora en la vista diaria.
 */
function getWorkIntervals(
  startTime: Date,
  endTime: Date | null,
  breaks: { start_time: Date; end_time: Date | null }[]
): [number, number][] {
  if (!endTime) return [];
  const start = (typeof startTime === "string" ? new Date(startTime) : startTime).getTime();
  const end = (typeof endTime === "string" ? new Date(endTime) : endTime).getTime();
  const breakRanges = (breaks || [])
    .filter((b) => b.end_time)
    .map((b) => ({
      s: (typeof b.start_time === "string" ? new Date(b.start_time) : b.start_time).getTime(),
      e: (typeof b.end_time === "string" ? new Date(b.end_time) : b.end_time!).getTime(),
    }))
    .filter((r) => r.e > r.s)
    .sort((a, b) => a.s - b.s);

  const intervals: [number, number][] = [];
  let pos = start;
  for (const br of breakRanges) {
    if (br.s > pos && pos < end) {
      intervals.push([pos, Math.min(br.s, end)]);
    }
    pos = Math.max(pos, br.e);
  }
  if (pos < end) intervals.push([pos, end]);
  return intervals;
}

/**
 * Minutos trabajados por hora (0-23) en un día dado.
 * Cada barra representa % de esa hora trabajada (minutos/60 * 100).
 */
export function computeMinutesPerHour(
  dayStart: Date,
  entries: {
    start_time: Date;
    end_time: Date | null;
    breaks?: { start_time: Date; end_time: Date | null }[];
  }[]
): { hour: number; minutes: number; percent: number }[] {
  const dayMs = startOfDay(dayStart).getTime();
  const minPerHour = new Array(24).fill(0);

  for (const entry of entries) {
    const intervals = getWorkIntervals(
      entry.start_time,
      entry.end_time,
      entry.breaks || []
    );
    for (const [s, e] of intervals) {
      for (let h = 0; h < 24; h++) {
        const hourStart = dayMs + h * 60 * 60 * 1000;
        const hourEnd = dayMs + (h + 1) * 60 * 60 * 1000;
        const overlapStart = Math.max(s, hourStart);
        const overlapEnd = Math.min(e, hourEnd);
        if (overlapEnd > overlapStart) {
          minPerHour[h] += (overlapEnd - overlapStart) / (60 * 1000);
        }
      }
    }
  }

  return minPerHour.map((minutes, hour) => ({
    hour,
    minutes: Math.round(minutes * 100) / 100,
    percent: Math.min(100, Math.round((minutes / 60) * 100)),
  }));
}

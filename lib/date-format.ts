/**
 * Estandarización global: todo el sistema usa formato de 24 horas (HH:mm).
 * Sin AM/PM. Uso obligatorio para vistas, reportes, PDFs y APIs.
 */
import { format as dateFnsFormat, type Locale } from "date-fns";
import { es } from "date-fns/locale";

/** Formato de hora: 24h (ej: 14:30). Nunca 12h. */
export function formatTime24(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateFnsFormat(d, "HH:mm");
}

/** Fecha y hora: dd/MM/yyyy HH:mm en 24h. */
export function formatDateTime24(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateFnsFormat(d, "dd/MM/yyyy HH:mm");
}

/** Fecha corta y hora: dd/MM/yy HH:mm en 24h. */
export function formatDateTime24Short(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateFnsFormat(d, "dd/MM/yy HH:mm");
}

/** Solo fecha: dd/MM/yyyy (sin hora). */
export function formatDate(date: Date | string, options?: { locale?: Locale }): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateFnsFormat(d, "dd/MM/yyyy", options ?? { locale: es });
}

/** Para Intl (si se usa en el futuro): siempre 24h. */
export const INTL_TIME_OPTIONS_24: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};


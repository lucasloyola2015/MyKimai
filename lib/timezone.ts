/**
 * Helpers de zona horaria. Todo el sistema reporta en hora de Argentina
 * (America/Argentina/Buenos_Aires, UTC-3 sin DST), pero el server corre en UTC
 * (Vercel). Sin normalizar, el trabajo cargado después de las 21:00 ART cae en
 * el día siguiente en los gráficos/PDFs que audita el cliente.
 *
 * Usar SIEMPRE estos helpers para agrupar/mostrar por día/semana/mes en server
 * actions. Son independientes del TZ del proceso (sirven en Vercel y en local).
 */

import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
} from "date-fns";

export const AR_TZ = "America/Argentina/Buenos_Aires";
export const AR_WEEK_STARTS_ON = 1 as const; // Lunes

/** Date cuyos campos locales representan el wall-clock de Argentina. */
export const arZoned = (d: Date | string | number): Date => toZonedTime(d, AR_TZ);

/** De un wall-clock AR (Date con campos AR) al instante UTC real. */
export const arToUtc = (zoned: Date): Date => fromZonedTime(zoned, AR_TZ);

/** Formatea un instante en hora de Argentina. */
export const arFormat = (d: Date | string | number, fmt: string): string =>
    formatInTimeZone(d, AR_TZ, fmt);

/** Clave de día (yyyy-MM-dd) en hora de Argentina, para agrupar. */
export const arDayKey = (d: Date | string | number): string =>
    formatInTimeZone(d, AR_TZ, "yyyy-MM-dd");

// Límites de período en hora AR, devueltos como instantes UTC (para queries DB).
export const startOfDayAr = (d: Date): Date => arToUtc(startOfDay(arZoned(d)));
export const endOfDayAr = (d: Date): Date => arToUtc(endOfDay(arZoned(d)));
export const startOfWeekAr = (d: Date): Date =>
    arToUtc(startOfWeek(arZoned(d), { weekStartsOn: AR_WEEK_STARTS_ON }));
export const endOfWeekAr = (d: Date): Date =>
    arToUtc(endOfWeek(arZoned(d), { weekStartsOn: AR_WEEK_STARTS_ON }));
export const startOfMonthAr = (d: Date): Date => arToUtc(startOfMonth(arZoned(d)));
export const endOfMonthAr = (d: Date): Date => arToUtc(endOfMonth(arZoned(d)));

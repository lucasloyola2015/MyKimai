/**
 * Validación de input de la API de agentes (MCP) para horas.
 *
 * Diferencias con los schemas de la UI (time-entries.ts):
 * - Las fechas/horas exigen zona horaria explícita (ISO 8601 con offset). Un
 *   "09:00" sin offset se interpretaría en UTC en Vercel y correría 3 h la hora.
 * - El agente NUNCA manda plata: no hay rate_applied / amount / billable.
 *   La tarifa sale de resolveRate y el monto lo calcula el trigger de la DB.
 */

import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { AR_TZ } from "@/lib/timezone";
import { workedMinutes, type BreakLike } from "@/lib/domain/segments";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });

/** Duración máxima de una entrada cargada por API. */
export const MAX_ENTRY_MINUTES = 24 * 60;
/** Duración mínima: menos de 30 minutos no se registra (regla de Lucas). */
export const MIN_ENTRY_MINUTES = 30;
/** Tolerancia para relojes desfasados al cargar una entrada que termina "ahora". */
export const FUTURE_TOLERANCE_MS = 5 * 60_000;
/** Rango máximo de consulta de horas. */
export const MAX_LIST_RANGE_DAYS = 366;

const isoInstant = z
    .string()
    .datetime({
        offset: true,
        message: "Usar ISO 8601 con zona horaria (ej. 2026-10-02T09:00:00-03:00)",
    })
    .transform((s) => new Date(s));

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Acepta un día `YYYY-MM-DD` (interpretado en hora de Argentina, al inicio o
 * al fin del día según `edge`) o un instante ISO con offset.
 */
const arDayOrInstant = (edge: "start" | "end") =>
    z.string().transform((value, ctx) => {
        if (DATE_ONLY.test(value)) {
            const wallClock = edge === "start" ? `${value}T00:00:00.000` : `${value}T23:59:59.999`;
            const date = fromZonedTime(wallClock, AR_TZ);
            if (!Number.isNaN(date.getTime())) return date;
        } else if (isoInstant.safeParse(value).success) {
            return new Date(value);
        }
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Usar YYYY-MM-DD (día en hora AR) o ISO 8601 con zona horaria",
            fatal: true,
        });
        return z.NEVER;
    });

/**
 * Reglas de rango de una entrada terminada. Devuelve el mensaje de error o null.
 * Se usa para el create y para el estado resultante de un update parcial.
 */
export function checkEntryRange(start: Date, end: Date, now: Date = new Date(), breaks: BreakLike[] = []): string | null {
    if (end.getTime() <= start.getTime()) {
        return "end_time debe ser posterior a start_time.";
    }
    // Se mide lo TRABAJADO (rango menos pausas): una sesión corta solo entra unida a otra del mismo
    // cliente, con una pausa en el medio.
    if (workedMinutes(start, end, breaks) < MIN_ENTRY_MINUTES) {
        return `Una entrada debe tener al menos ${MIN_ENTRY_MINUTES} minutos trabajados; menos no se registra (una sesión corta se une a otra del mismo cliente con una pausa en el medio).`;
    }
    if (end.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
        return "No se pueden cargar horas en el futuro.";
    }
    if (end.getTime() - start.getTime() > MAX_ENTRY_MINUTES * 60_000) {
        return `Una entrada no puede durar más de ${MAX_ENTRY_MINUTES / 60} horas.`;
    }
    return null;
}

const title = z.string().trim().min(1, "El título es obligatorio").max(255);
/** Pausas dentro de la entrada (p. ej. para unir una sesión corta con otra del mismo cliente). */
const breaks = z
    .array(z.object({ start_time: isoInstant, end_time: isoInstant }))
    .max(20)
    .optional();
const description = z.string().trim().max(2000).nullable().optional();

export const apiCreateEntrySchema = z.object({
    project_id: uuid,
    title,
    description,
    start_time: isoInstant,
    end_time: isoInstant,
    /** Referencia idempotente del agente: si ya existe, se actualiza esa entrada. */
    external_ref: z.string().trim().min(1).max(255).optional(),
    /**
     * Confirmación del usuario para solaparse con horas de OTROS proyectos
     * (trabajo en paralelo). Con el MISMO proyecto nunca se permite.
     */
    allow_overlap: z.boolean().optional().default(false),
    /** Trabajo autónomo de un agente: va a la tarea "Trabajo autónomo" (tarifa con descuento). */
    autonomous: z.boolean().optional().default(false),
    breaks,
});
export type ApiCreateEntryInput = z.input<typeof apiCreateEntrySchema>;

export const apiUpdateEntrySchema = z
    .object({
        entry_id: uuid,
        project_id: uuid.optional(),
        title: title.optional(),
        description,
        start_time: isoInstant.optional(),
        end_time: isoInstant.optional(),
        allow_overlap: z.boolean().optional().default(false),
        autonomous: z.boolean().optional(),
        /** Reemplaza TODAS las pausas de la entrada ([] = sin pausas). */
        breaks,
    })
    .refine(
        (d) =>
            d.project_id !== undefined ||
            d.autonomous !== undefined ||
            d.breaks !== undefined ||
            d.title !== undefined ||
            d.description !== undefined ||
            d.start_time !== undefined ||
            d.end_time !== undefined,
        { message: "Se requiere al menos un campo a actualizar" }
    );
export type ApiUpdateEntryInput = z.input<typeof apiUpdateEntrySchema>;

const rangeFilters = z.object({
    from: arDayOrInstant("start"),
    to: arDayOrInstant("end"),
    project_id: uuid.optional(),
    client_id: uuid.optional(),
    /** 'mine' = mis horas; 'workspace' = de todo el equipo (solo owner/admin). */
    scope: z.enum(["mine", "workspace"]).optional().default("mine"),
});

function refineRange(d: { from: Date; to: Date }, ctx: z.RefinementCtx) {
    if (d.to.getTime() < d.from.getTime()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "'to' debe ser posterior o igual a 'from'",
            path: ["to"],
        });
    } else if (d.to.getTime() - d.from.getTime() > MAX_LIST_RANGE_DAYS * 86_400_000) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `El rango no puede superar ${MAX_LIST_RANGE_DAYS} días`,
            path: ["to"],
        });
    }
}

export const apiListEntriesSchema = rangeFilters.superRefine(refineRange);
export type ApiListEntriesInput = z.input<typeof apiListEntriesSchema>;

export const apiHoursSummarySchema = rangeFilters
    .extend({
        group_by: z.enum(["day", "week", "month", "project", "client"]).optional().default("day"),
    })
    .superRefine(refineRange);
export type ApiHoursSummaryInput = z.input<typeof apiHoursSummarySchema>;

export const apiCheckTimeSlotSchema = z
    .object({
        start_time: isoInstant,
        end_time: isoInstant,
        /** Proyecto donde se quiere cargar: marca qué solapamientos son del mismo proyecto. */
        project_id: uuid.optional(),
        /** Al editar, excluir la propia entrada. */
        exclude_entry_id: uuid.optional(),
    })
    .refine((d) => d.end_time.getTime() > d.start_time.getTime(), {
        message: "end_time debe ser posterior a start_time",
        path: ["end_time"],
    });
export type ApiCheckTimeSlotInput = z.input<typeof apiCheckTimeSlotSchema>;

/**
 * Validación de entrada para Server Actions de time_entries.
 *
 * §4.5 IMPROVEMENT_PLAN — toda mutación debe parsear su input con zod
 * antes de tocar la DB, para defender contra payloads malformados.
 *
 * Las acciones cubiertas hasta ahora:
 * - startTimeEntry
 * - stopTimeEntry
 * - updateTimeEntry
 * - deleteTimeEntry
 *
 * Pendiente cubrir en sprints incrementales: pausas, breaks, consolidación.
 */

import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });

export const startTimeEntrySchema = z.object({
    taskId: uuid,
    description: z.string().max(2000).nullable().optional(),
    title: z.string().max(255).nullable().optional(),
});

export const stopTimeEntrySchema = z.object({
    entryId: uuid,
});

export const deleteTimeEntrySchema = z.object({
    entryId: uuid,
});

/**
 * Schema para `updateTimeEntry`. Los campos son todos opcionales: al menos
 * uno debe estar presente para que la actualización tenga sentido.
 *
 * Reglas de negocio defensivas:
 * - `duration_total` y `duration_neto` son MINUTOS enteros y nunca negativos.
 *   Los recalcula el trigger DB; aceptarlos vía API es legacy, pero validamos
 *   igual.
 * - `rate_applied` y `amount` son monetarios; rechazamos negativos.
 * - `start_time` y `end_time` se aceptan como ISO strings o Date y se coercen.
 */
export const updateTimeEntrySchema = z
    .object({
        entryId: uuid,
        data: z
            .object({
                description: z.string().max(2000).nullable().optional(),
                title: z.string().max(255).nullable().optional(),
                start_time: z.coerce.date().optional(),
                end_time: z.coerce.date().nullable().optional(),
                duration_total: z.number().int().nonnegative().nullable().optional(),
                duration_neto: z.number().int().nonnegative().nullable().optional(),
                billable: z.boolean().optional(),
                rate_applied: z.number().nonnegative().nullable().optional(),
                amount: z.number().nonnegative().nullable().optional(),
                task_id: uuid.optional(),
            })
            .refine((d) => Object.keys(d).length > 0, {
                message: "Se requiere al menos un campo a actualizar",
            }),
    });

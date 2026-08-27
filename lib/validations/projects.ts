/**
 * Validación de entrada para Server Actions de projects.
 * §4.5 IMPROVEMENT_PLAN — toda mutación parsea su input con zod.
 */

import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });
const rate = z.number().finite().nonnegative({ message: "La tarifa no puede ser negativa" });

const projectBase = {
    name: z.string().min(1, { message: "El nombre es obligatorio" }).max(255),
    description: z.string().max(5000).nullable().optional(),
    currency: z.string().length(3).optional(),
    rate: rate.nullable().optional(),
    billing_type: z.enum(["fixed", "hourly"]).optional(),
    status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
    start_date: z.coerce.date().nullable().optional(),
    end_date: z.coerce.date().nullable().optional(),
    is_billable: z.boolean().optional(),
};

export const createProjectSchema = z.object({
    client_id: uuid,
    ...projectBase,
});

// client_id opcional: permite REASIGNAR el proyecto a otro cliente.
export const updateProjectSchema = z
    .object({ ...projectBase, client_id: uuid })
    .partial();

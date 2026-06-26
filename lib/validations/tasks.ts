/**
 * Validación de entrada para Server Actions de tasks.
 * §4.5 IMPROVEMENT_PLAN — toda mutación parsea su input con zod.
 */

import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });
const rate = z.number().finite().nonnegative({ message: "La tarifa no puede ser negativa" });

export const createTaskSchema = z.object({
    project_id: uuid,
    name: z.string().min(1, { message: "El nombre es obligatorio" }).max(255),
    description: z.string().max(5000).nullable().optional(),
    rate: rate.nullable().optional(),
    is_billable: z.boolean().optional(),
});

export const updateTaskSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    rate: rate.nullable().optional(),
    is_billable: z.boolean().optional(),
});

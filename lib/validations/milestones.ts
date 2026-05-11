/**
 * §F5 IMPROVEMENT_PLAN — Validación de Server Actions de milestones.
 */
import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });

export const createMilestoneSchema = z.object({
    project_id: uuid,
    name: z.string().min(1).max(255),
    description: z.string().max(5000).nullable().optional(),
    target_date: z.coerce.date().nullable().optional(),
    status: z
        .enum(["planned", "in_progress", "completed", "blocked", "cancelled"])
        .default("planned"),
    budget_hours: z.number().nonnegative().nullable().optional(),
    budget_amount: z.number().nonnegative().nullable().optional(),
    budget_currency: z.string().length(3).nullable().optional(),
    display_order: z.number().int().nonnegative().optional(),
    visible_to_client: z.boolean().optional(),
});

export const updateMilestoneSchema = z.object({
    id: uuid,
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    target_date: z.coerce.date().nullable().optional(),
    status: z
        .enum(["planned", "in_progress", "completed", "blocked", "cancelled"])
        .optional(),
    completion_notes: z.string().max(5000).nullable().optional(),
    budget_hours: z.number().nonnegative().nullable().optional(),
    budget_amount: z.number().nonnegative().nullable().optional(),
    budget_currency: z.string().length(3).nullable().optional(),
    display_order: z.number().int().nonnegative().optional(),
    visible_to_client: z.boolean().optional(),
});

export const deleteMilestoneSchema = z.object({
    id: uuid,
});

export const assignTimeEntryMilestoneSchema = z.object({
    entry_id: uuid,
    milestone_id: uuid.nullable(),
});

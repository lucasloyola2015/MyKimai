/**
 * §F4 IMPROVEMENT_PLAN — Validación de Server Actions de project_access.
 */
import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });

export const grantProjectAccessSchema = z.object({
    project_id: uuid,
    client_user_id: uuid,
    role: z.enum(["viewer", "manager"]).default("viewer"),
});

export const updateProjectAccessSchema = z.object({
    id: uuid,
    role: z.enum(["viewer", "manager"]),
});

export const revokeProjectAccessSchema = z.object({
    id: uuid,
});

export const updateClientUserVisibilitySchema = z.object({
    id: uuid,
    sees_all_projects: z.boolean(),
});

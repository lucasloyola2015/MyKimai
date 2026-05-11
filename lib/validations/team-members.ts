/**
 * §F3 IMPROVEMENT_PLAN — Validación de Server Actions de team_members.
 */

import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });

export const inviteTeamMemberSchema = z.object({
    email: z.string().email({ message: "Email inválido" }),
    password: z
        .string()
        .min(8, { message: "La contraseña debe tener al menos 8 caracteres" }),
    role: z.enum(["collaborator", "admin"]),
    default_rate: z.number().nonnegative().nullable().optional(),
    default_currency: z
        .string()
        .length(3, { message: "Moneda inválida (3 letras, ej. USD)" })
        .nullable()
        .optional(),
});

export const updateTeamMemberSchema = z.object({
    id: uuid,
    role: z.enum(["collaborator", "admin"]).optional(),
    default_rate: z.number().nonnegative().nullable().optional(),
    default_currency: z.string().length(3).nullable().optional(),
});

export const removeTeamMemberSchema = z.object({
    id: uuid,
});

/**
 * Validación de entrada para Server Actions de clients.
 * §4.5 IMPROVEMENT_PLAN — toda mutación parsea su input con zod.
 */

import { z } from "zod";

const optionalText = (max: number) => z.string().max(max).nullable().optional();
const currency = z.string().length(3, { message: "Moneda inválida (3 letras, ej. USD)" });
const rate = z.number().finite().nonnegative({ message: "La tarifa no puede ser negativa" });

export const createClientSchema = z.object({
    name: z.string().min(1, { message: "El nombre es obligatorio" }).max(255),
    // Email opcional; si viene no vacío debe ser válido. Se acepta "" / null.
    email: z.string().max(255).email({ message: "Email inválido" }).or(z.literal("")).nullable().optional(),
    phone: optionalText(50),
    address: optionalText(2000),
    currency: currency.optional(),
    default_rate: rate.nullable().optional(),
    notes: optionalText(5000),
    logo_url: optionalText(2000),
    is_billable: z.boolean().optional(),
    tax_id: optionalText(50),
    business_name: optionalText(255),
    legal_address: optionalText(2000),
    tax_condition: optionalText(100),
});

export const updateClientSchema = createClientSchema
    .partial()
    .extend({
        newPassword: z.string().min(6, { message: "La contraseña debe tener al menos 6 caracteres" }).max(72).optional(),
    });

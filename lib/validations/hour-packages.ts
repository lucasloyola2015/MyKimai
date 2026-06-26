/**
 * Validación de entrada para Server Actions de hour_packages.
 * §4.5 IMPROVEMENT_PLAN — toda mutación parsea su input con zod.
 * NO incluye hours_used: lo mantiene el trigger de DB (§4.3).
 */

import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });

export const createHourPackageSchema = z.object({
    client_id: uuid,
    project_id: uuid.nullable().optional(),
    hours: z.number().finite().positive({ message: "Las horas deben ser mayores a 0" }),
    price: z.number().finite().nonnegative({ message: "El precio no puede ser negativo" }),
    currency: z.string().length(3).optional(),
    expires_at: z.coerce.date().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    reserved_for_client_user_id: uuid.nullable().optional(),
});

export const updateHourPackageSchema = createHourPackageSchema.partial().omit({ client_id: true });

/**
 * Validación de entrada para Server Actions de payments.
 *
 * §4.5 IMPROVEMENT_PLAN — toda mutación parsea su input con zod antes de tocar
 * la DB. `amount` debe ser un número finito y positivo (un pago de 0 o negativo
 * corrompe el saldo y el estado paid/partial de la factura).
 */

import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });

export const recordPaymentSchema = z.object({
    invoice_id: uuid,
    amount: z
        .number({ invalid_type_error: "El monto debe ser numérico" })
        .finite({ message: "El monto debe ser un número válido" })
        .positive({ message: "El monto debe ser mayor a 0" }),
    payment_date: z.coerce.date({ invalid_type_error: "Fecha de pago inválida" }),
    method: z.string().max(100).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
});

export const deletePaymentSchema = z.object({
    payment_id: uuid,
});

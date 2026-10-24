/**
 * Validación de entrada para Server Actions de invoices.
 *
 * §4.5 IMPROVEMENT_PLAN — patrón uniforme: cada mutación parsea su input
 * con zod antes de tocar la DB.
 *
 * Los nombres de campos siguen el snake_case del schema Prisma para no
 * forzar conversiones en los callers existentes.
 */

import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });

export const createInvoiceFromTimeEntriesSchema = z.object({
    client_id: uuid,
    time_entry_ids: z.array(uuid),
    /** Gastos de proyecto a refacturar (una línea de detalle por gasto). */
    expense_ids: z.array(uuid).optional(),
    tax_rate: z.number().nonnegative().max(100).optional(),
    due_date: z.coerce.date().nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    billing_type: z.enum(["LEGAL", "INTERNAL"]).optional(),
    currency: z.string().length(3).optional(),
    exchange_strategy: z.enum(["CURRENT", "HISTORICAL"]).optional(),
    cbte_tipo: z.number().int().positive().optional(),
    /** §descuento — % sobre el subtotal (0-100) y su motivo, se agrega como
     * un invoice_item negativo. */
    discount_percent: z.number().min(0).max(100).optional(),
    discount_reason: z.string().max(500).nullable().optional(),
}).refine((d) => d.time_entry_ids.length > 0 || (d.expense_ids?.length ?? 0) > 0, {
    message: "Se requiere al menos un registro de tiempo o un gasto",
    path: ["time_entry_ids"],
});

export const updateInvoiceStatusSchema = z.object({
    id: uuid,
    status: z.enum(["draft", "sent", "paid", "overdue", "partial", "cancelled"]),
});

export const deleteInvoiceSchema = z.object({
    id: uuid,
});

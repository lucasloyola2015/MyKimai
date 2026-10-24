/**
 * Validación de Server Actions de gastos extra de proyecto.
 */
import { z } from "zod";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });

/** Tipos que acepta el bucket `expense-attachments` (ver la migración). */
export const EXPENSE_ATTACHMENT_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
] as const;

export const EXPENSE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

const expenseFields = {
    description: z.string().trim().min(1, { message: "Falta la descripción" }).max(500),
    supplier: z.string().trim().max(255).nullable().optional(),
    expense_date: z.coerce.date(),
    amount: z.number().positive({ message: "El monto debe ser mayor a 0" }).max(9_999_999_999),
    currency: z.enum(["ARS", "USD"]),
    billable: z.boolean().optional(),
    notes: z.string().max(5000).nullable().optional(),
};

export const createExpenseSchema = z.object({
    project_id: uuid,
    ...expenseFields,
});

/** Edición parcial: solo cambian los campos que vengan. */
export const updateExpenseSchema = z.object({
    id: uuid,
    ...expenseFields,
}).partial().required({ id: true });

export type CreateExpenseInput = z.input<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;

export const expenseIdSchema = z.object({ id: uuid });

export const expenseAttachmentUploadSchema = z.object({
    expense_id: uuid,
    file_name: z.string().min(1).max(255),
    mime_type: z.enum(EXPENSE_ATTACHMENT_MIME_TYPES, {
        errorMap: () => ({ message: "Solo se aceptan imágenes (JPG, PNG, WEBP, HEIC) o PDF" }),
    }),
    size_bytes: z.number().int().positive().max(EXPENSE_ATTACHMENT_MAX_BYTES, {
        message: "El archivo supera los 20 MB",
    }),
});

export const confirmExpenseAttachmentSchema = expenseAttachmentUploadSchema.extend({
    storage_path: z.string().min(1).max(1024),
});

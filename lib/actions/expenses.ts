"use server";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma/client";
import {
    getOwnerContext,
    canManageWorkspace,
    canSeeFinancials,
} from "@/lib/auth/owner-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { safeActionError, zodErrorMessage } from "@/lib/validations/utils";
import {
    createExpenseSchema,
    updateExpenseSchema,
    expenseIdSchema,
    expenseAttachmentUploadSchema,
    confirmExpenseAttachmentSchema,
} from "@/lib/validations/expenses";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/** Bucket privado de comprobantes (supabase/migrations/2026-10-24_project_expenses.sql). */
const BUCKET = "expense-attachments";
/** Vida de las URLs firmadas de descarga. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface ExpenseAttachmentView {
    id: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    /** URL firmada de corta vida (el bucket es privado). */
    url: string | null;
}

export interface ExpenseView {
    id: string;
    project_id: string;
    project_name: string;
    description: string;
    supplier: string | null;
    /** YYYY-MM-DD (columna DATE). */
    expense_date: string;
    amount: number;
    currency: string;
    billable: boolean;
    notes: string | null;
    invoice_id: string | null;
    invoice_number: string | null;
    attachments: ExpenseAttachmentView[];
}

const expenseInclude = {
    projects: { select: { name: true } },
    invoices: { select: { invoice_number: true } },
    attachments: { orderBy: { created_at: "asc" as const } },
};

type ExpenseRow = Awaited<
    ReturnType<typeof prisma.project_expenses.findMany<{ include: typeof expenseInclude }>>
>[number];

async function toExpenseViews(rows: ExpenseRow[]): Promise<ExpenseView[]> {
    const paths = rows.flatMap((r) => r.attachments.map((a) => a.storage_path));
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
        // Sin URLs (Storage caído o sin service role) el listado igual se muestra.
        try {
            const { data } = await createAdminClient()
                .storage.from(BUCKET)
                .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
            for (const s of data ?? []) {
                if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
            }
        } catch (error) {
            console.error("[expenses] signed URLs", error);
        }
    }

    return rows.map((r) => ({
        id: r.id,
        project_id: r.project_id,
        project_name: r.projects.name,
        description: r.description,
        supplier: r.supplier,
        expense_date: r.expense_date.toISOString().slice(0, 10),
        amount: Number(r.amount),
        currency: r.currency,
        billable: r.billable,
        notes: r.notes,
        invoice_id: r.invoice_id,
        invoice_number: r.invoices?.invoice_number ?? null,
        attachments: r.attachments.map((a) => ({
            id: a.id,
            file_name: a.file_name,
            mime_type: a.mime_type,
            size_bytes: a.size_bytes,
            url: urlByPath.get(a.storage_path) ?? null,
        })),
    }));
}

/** Gastos de un proyecto del workspace (más recientes primero). */
export async function getProjectExpenses(projectId: string): Promise<ExpenseView[]> {
    const ctx = await getOwnerContext();
    if (!canSeeFinancials(ctx)) return [];

    const rows = await prisma.project_expenses.findMany({
        where: {
            project_id: projectId,
            projects: { clients: { user_id: ctx.ownerId } },
        },
        include: expenseInclude,
        orderBy: [{ expense_date: "desc" }, { created_at: "desc" }],
    });
    return toExpenseViews(rows);
}

/** Gastos facturables pendientes de un cliente, para armar la próxima factura. */
export async function getUnbilledExpenses(clientId: string): Promise<ExpenseView[]> {
    const ctx = await getOwnerContext();
    if (!canSeeFinancials(ctx)) return [];

    const rows = await prisma.project_expenses.findMany({
        where: {
            billable: true,
            invoice_id: null,
            projects: { client_id: clientId, clients: { user_id: ctx.ownerId } },
        },
        include: expenseInclude,
        orderBy: [{ expense_date: "asc" }, { created_at: "asc" }],
    });
    return toExpenseViews(rows);
}

/** Gasto del workspace, o null. */
async function findOwnedExpense(id: string, ownerId: string) {
    return prisma.project_expenses.findFirst({
        where: { id, projects: { clients: { user_id: ownerId } } },
        include: { attachments: { select: { storage_path: true } } },
    });
}

export async function createExpense(
    input: Parameters<typeof createExpenseSchema.parse>[0]
): Promise<ActionResponse<{ id: string }>> {
    const parsed = createExpenseSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, error: "Solo el dueño del workspace puede cargar gastos." };
    }

    const project = await prisma.projects.findFirst({
        where: { id: parsed.data.project_id, clients: { user_id: ctx.ownerId } },
        select: { id: true },
    });
    if (!project) {
        return { success: false, error: "Proyecto no encontrado." };
    }

    try {
        const expense = await prisma.project_expenses.create({
            data: {
                project_id: parsed.data.project_id,
                description: parsed.data.description,
                supplier: parsed.data.supplier || null,
                expense_date: parsed.data.expense_date,
                amount: parsed.data.amount,
                currency: parsed.data.currency,
                billable: parsed.data.billable ?? true,
                notes: parsed.data.notes || null,
                created_by: ctx.actorId,
            },
        });
        revalidatePath(`/dashboard/projects/${parsed.data.project_id}/expenses`);
        return { success: true, data: { id: expense.id } };
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo cargar el gasto.") };
    }
}

export async function updateExpense(
    input: Parameters<typeof updateExpenseSchema.parse>[0]
): Promise<ActionResponse<void>> {
    const parsed = updateExpenseSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, error: "Solo el dueño del workspace puede editar gastos." };
    }

    const existing = await findOwnedExpense(parsed.data.id, ctx.ownerId);
    if (!existing) {
        return { success: false, error: "Gasto no encontrado." };
    }
    if (existing.invoice_id) {
        return { success: false, error: "El gasto ya está facturado: no se puede editar." };
    }

    try {
        await prisma.project_expenses.update({
            where: { id: existing.id },
            data: {
                description: parsed.data.description,
                supplier: parsed.data.supplier || null,
                expense_date: parsed.data.expense_date,
                amount: parsed.data.amount,
                currency: parsed.data.currency,
                billable: parsed.data.billable ?? existing.billable,
                notes: parsed.data.notes || null,
            },
        });
        revalidatePath(`/dashboard/projects/${existing.project_id}/expenses`);
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo editar el gasto.") };
    }
}

export async function deleteExpense(id: string): Promise<ActionResponse<void>> {
    const parsed = expenseIdSchema.safeParse({ id });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, error: "Solo el dueño del workspace puede borrar gastos." };
    }

    const existing = await findOwnedExpense(id, ctx.ownerId);
    if (!existing) {
        return { success: false, error: "Gasto no encontrado." };
    }
    if (existing.invoice_id) {
        return { success: false, error: "El gasto ya está facturado: no se puede borrar." };
    }

    try {
        // Los adjuntos se borran por cascade en la DB; los archivos, a mano.
        await prisma.project_expenses.delete({ where: { id } });
        const paths = existing.attachments.map((a) => a.storage_path);
        if (paths.length > 0) {
            await createAdminClient().storage.from(BUCKET).remove(paths);
        }
        revalidatePath(`/dashboard/projects/${existing.project_id}/expenses`);
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo borrar el gasto.") };
    }
}

/**
 * Paso 1 de la subida de un comprobante: emite una URL firmada para que el
 * navegador suba el archivo directo a Storage (sin pasar por la función, que
 * en Vercel corta en ~4,5 MB). Paso 2: `confirmExpenseAttachment`.
 */
export async function createExpenseAttachmentUpload(
    input: Parameters<typeof expenseAttachmentUploadSchema.parse>[0]
): Promise<ActionResponse<{ storage_path: string; token: string }>> {
    const parsed = expenseAttachmentUploadSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, error: "Solo el dueño del workspace puede adjuntar comprobantes." };
    }

    const expense = await findOwnedExpense(parsed.data.expense_id, ctx.ownerId);
    if (!expense) {
        return { success: false, error: "Gasto no encontrado." };
    }

    const safeName =
        parsed.data.file_name
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-zA-Z0-9._-]+/g, "_")
            .slice(-120) || "archivo";
    const storagePath = `${ctx.ownerId}/${expense.id}/${randomUUID()}-${safeName}`;

    const { data, error } = await createAdminClient()
        .storage.from(BUCKET)
        .createSignedUploadUrl(storagePath);
    if (error || !data) {
        return { success: false, error: safeActionError(error, "No se pudo preparar la subida.") };
    }
    return { success: true, data: { storage_path: data.path, token: data.token } };
}

/** Paso 2: registra el comprobante ya subido. */
export async function confirmExpenseAttachment(
    input: Parameters<typeof confirmExpenseAttachmentSchema.parse>[0]
): Promise<ActionResponse<{ id: string }>> {
    const parsed = confirmExpenseAttachmentSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, error: "Solo el dueño del workspace puede adjuntar comprobantes." };
    }

    const expense = await findOwnedExpense(parsed.data.expense_id, ctx.ownerId);
    if (!expense) {
        return { success: false, error: "Gasto no encontrado." };
    }

    // El path lo emitió createExpenseAttachmentUpload para ESTE gasto: no se
    // acepta registrar un archivo de otra carpeta (de otro gasto u otro tenant).
    const folder = `${ctx.ownerId}/${expense.id}`;
    const { storage_path } = parsed.data;
    if (!storage_path.startsWith(`${folder}/`) || storage_path.includes("..")) {
        return { success: false, error: "Archivo inválido." };
    }
    const fileName = storage_path.slice(folder.length + 1);
    const { data: listed } = await createAdminClient()
        .storage.from(BUCKET)
        .list(folder, { search: fileName });
    if (!listed?.some((f) => f.name === fileName)) {
        return { success: false, error: "El archivo no se terminó de subir." };
    }

    try {
        const attachment = await prisma.project_expense_attachments.create({
            data: {
                expense_id: expense.id,
                storage_path,
                file_name: parsed.data.file_name,
                mime_type: parsed.data.mime_type,
                size_bytes: parsed.data.size_bytes,
            },
        });
        revalidatePath(`/dashboard/projects/${expense.project_id}/expenses`);
        return { success: true, data: { id: attachment.id } };
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo registrar el comprobante.") };
    }
}

export async function deleteExpenseAttachment(id: string): Promise<ActionResponse<void>> {
    const parsed = expenseIdSchema.safeParse({ id });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, error: "Solo el dueño del workspace puede borrar comprobantes." };
    }

    const attachment = await prisma.project_expense_attachments.findFirst({
        where: { id, expense: { projects: { clients: { user_id: ctx.ownerId } } } },
        include: { expense: { select: { project_id: true } } },
    });
    if (!attachment) {
        return { success: false, error: "Comprobante no encontrado." };
    }

    try {
        await prisma.project_expense_attachments.delete({ where: { id } });
        await createAdminClient().storage.from(BUCKET).remove([attachment.storage_path]);
        revalidatePath(`/dashboard/projects/${attachment.expense.project_id}/expenses`);
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo borrar el comprobante.") };
    }
}

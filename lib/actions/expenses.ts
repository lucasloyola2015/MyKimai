"use server";

import { getOwnerContext, canSeeFinancials } from "@/lib/auth/owner-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { safeActionError, zodErrorMessage } from "@/lib/validations/utils";
import {
    expenseIdSchema,
    confirmExpenseAttachmentSchema,
    type CreateExpenseInput,
    type UpdateExpenseInput,
} from "@/lib/validations/expenses";
import * as domain from "@/lib/domain/expenses";
import type { DomainResult, EntryAccessContext } from "@/lib/domain/time-entries";

export type { ExpenseView, ExpenseAttachmentView } from "@/lib/domain/expenses";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/** Contexto de la sesión para la capa de dominio (la app no tiene scopes de API key). */
async function sessionContext(): Promise<EntryAccessContext> {
    const ctx = await getOwnerContext();
    return { ...ctx, financials: canSeeFinancials(ctx) };
}

function toAction<T, R>(result: DomainResult<T>, map: (data: T) => R): ActionResponse<R> {
    return result.ok ? { success: true, data: map(result.data) } : { success: false, error: result.error };
}

const revalidateProject = (projectId: string) => revalidatePath(`/dashboard/projects/${projectId}/expenses`);

/** Gastos de un proyecto del workspace (más recientes primero), con URLs de los comprobantes. */
export async function getProjectExpenses(projectId: string): Promise<domain.ExpenseView[]> {
    const res = await domain.listExpenses(await sessionContext(), { project_id: projectId, with_urls: true });
    return res.ok ? res.data : [];
}

/** Gastos facturables pendientes de un cliente, para armar la próxima factura. */
export async function getUnbilledExpenses(clientId: string): Promise<domain.ExpenseView[]> {
    const res = await domain.listExpenses(await sessionContext(), { client_id: clientId, status: "pending" });
    return res.ok ? res.data : [];
}

export async function createExpense(
    input: CreateExpenseInput
): Promise<ActionResponse<{ id: string }>> {
    try {
        const res = await domain.createExpense(await sessionContext(), input);
        if (res.ok) revalidateProject(res.data.project_id);
        return toAction(res, (e) => ({ id: e.id }));
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo cargar el gasto.") };
    }
}

export async function updateExpense(
    input: UpdateExpenseInput
): Promise<ActionResponse<void>> {
    try {
        const res = await domain.updateExpense(await sessionContext(), input);
        if (res.ok) revalidateProject(res.data.project_id);
        return toAction(res, () => undefined);
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo editar el gasto.") };
    }
}

export async function deleteExpense(id: string): Promise<ActionResponse<void>> {
    const parsed = expenseIdSchema.safeParse({ id });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }
    try {
        const res = await domain.deleteExpense(await sessionContext(), id);
        if (res.ok) revalidateProject(res.data.project_id);
        return toAction(res, () => undefined);
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
    input: Parameters<typeof domain.prepareExpenseAttachment>[1]
): Promise<ActionResponse<{ storage_path: string; token: string }>> {
    const prep = await domain.prepareExpenseAttachment(await sessionContext(), input);
    if (!prep.ok) return { success: false, error: prep.error };

    const { data, error } = await createAdminClient()
        .storage.from(domain.EXPENSE_BUCKET)
        .createSignedUploadUrl(prep.data.storage_path);
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
    try {
        const ctx = await sessionContext();
        const res = await domain.registerExpenseAttachment(ctx, parsed.data);
        if (res.ok) revalidateProject(res.data.project_id);
        return toAction(res, (a) => ({ id: a.id }));
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo registrar el comprobante.") };
    }
}

export async function deleteExpenseAttachment(id: string): Promise<ActionResponse<void>> {
    const parsed = expenseIdSchema.safeParse({ id });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }
    try {
        const res = await domain.deleteExpenseAttachment(await sessionContext(), id);
        if (res.ok) revalidateProject(res.data.project_id);
        return toAction(res, () => undefined);
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo borrar el comprobante.") };
    }
}

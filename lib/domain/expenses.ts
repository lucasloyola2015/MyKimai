/**
 * Gastos extra de proyecto (compras que se refacturan al cliente) y sus comprobantes. Los usan
 * las Server Actions de la app (lib/actions/expenses.ts) y la API de agentes (lib/mcp/server.ts).
 *
 * ⚠️ NO es "use server" (recibe el contexto por parámetro). Regla de Oro #1: todo filtra por
 * `ctx.ownerId`. Un gasto es plata: leerlo pide `ctx.financials`; cargarlo, editarlo o borrarlo,
 * además, ser el owner del workspace (igual que en la app). Un gasto facturado no se toca.
 */

import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma/client";
import { canManageWorkspace } from "@/lib/auth/owner-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { zodErrorMessage } from "@/lib/validations/utils";
import {
    createExpenseSchema,
    updateExpenseSchema,
    expenseAttachmentUploadSchema,
    type CreateExpenseInput,
    type UpdateExpenseInput,
} from "@/lib/validations/expenses";
import { expenseStoragePath } from "@/lib/utils/expenses";
import { fail, type DomainResult, type EntryAccessContext } from "./time-entries";

/** Bucket privado de comprobantes (supabase/migrations/2026-10-24_project_expenses.sql). */
export const EXPENSE_BUCKET = "expense-attachments";
/** Vida de las URLs firmadas de descarga. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface ExpenseAttachmentView {
    id: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    /** URL firmada de corta vida (el bucket es privado). Null si no se pidieron URLs. */
    url: string | null;
}

export interface ExpenseView {
    id: string;
    project_id: string;
    project_name: string;
    client_id: string;
    client_name: string;
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
    projects: { select: { name: true, client_id: true, clients: { select: { name: true } } } },
    invoices: { select: { invoice_number: true } },
    attachments: { orderBy: { created_at: "asc" as const } },
};

type ExpenseRow = Awaited<
    ReturnType<typeof prisma.project_expenses.findMany<{ include: typeof expenseInclude }>>
>[number];

async function toExpenseViews(rows: ExpenseRow[], withUrls: boolean): Promise<ExpenseView[]> {
    const paths = withUrls ? rows.flatMap((r) => r.attachments.map((a) => a.storage_path)) : [];
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
        // Sin URLs (Storage caído o sin service role) el listado igual se muestra.
        try {
            const { data } = await createAdminClient()
                .storage.from(EXPENSE_BUCKET)
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
        client_id: r.projects.client_id,
        client_name: r.projects.clients.name,
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

function guardRead(ctx: EntryAccessContext): DomainResult<never> | null {
    return ctx.financials ? null : fail("forbidden", "Ver gastos requiere acceso financiero.");
}

function guardWrite(ctx: EntryAccessContext, what: string): DomainResult<never> | null {
    if (!canManageWorkspace(ctx)) return fail("forbidden", `Solo el dueño del workspace puede ${what}.`);
    if (!ctx.financials) return fail("forbidden", `Para ${what} hace falta acceso financiero.`);
    return null;
}

/** Gasto del workspace, o null. */
async function findOwnedExpense(id: string, ownerId: string) {
    return prisma.project_expenses.findFirst({
        where: { id, projects: { clients: { user_id: ownerId } } },
        include: { attachments: { select: { storage_path: true } } },
    });
}

async function viewOf(id: string, withUrls: boolean): Promise<ExpenseView> {
    const row = await prisma.project_expenses.findUniqueOrThrow({ where: { id }, include: expenseInclude });
    return (await toExpenseViews([row], withUrls))[0];
}

// ─── Consultas ──────────────────────────────────────────────────────────────

export interface ListExpensesFilter {
    project_id?: string;
    client_id?: string;
    /** 'pending' = facturables sin facturar · 'billed' = ya facturados · 'all' (default). */
    status?: "pending" | "billed" | "all";
    /** Rango de fecha del gasto (columna DATE, medianoche UTC). */
    from?: Date;
    to?: Date;
    /** Firmar URLs de descarga de los comprobantes (la app sí, la API no las necesita). */
    with_urls?: boolean;
}

/** Gastos del workspace. `status: 'pending'` es lo que entra en la próxima factura. */
export async function listExpenses(
    ctx: EntryAccessContext,
    filter: ListExpensesFilter = {}
): Promise<DomainResult<ExpenseView[]>> {
    const denied = guardRead(ctx);
    if (denied) return denied;

    const status = filter.status ?? "all";
    const rows = await prisma.project_expenses.findMany({
        where: {
            projects: {
                clients: { user_id: ctx.ownerId },
                ...(filter.client_id ? { client_id: filter.client_id } : {}),
            },
            ...(filter.project_id ? { project_id: filter.project_id } : {}),
            ...(status === "pending" ? { billable: true, invoice_id: null } : {}),
            ...(status === "billed" ? { invoice_id: { not: null } } : {}),
            ...(filter.from || filter.to
                ? { expense_date: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
                : {}),
        },
        include: expenseInclude,
        orderBy:
            status === "pending"
                ? [{ expense_date: "asc" }, { created_at: "asc" }]
                : [{ expense_date: "desc" }, { created_at: "desc" }],
    });
    return { ok: true, data: await toExpenseViews(rows, filter.with_urls ?? false) };
}

// ─── Mutaciones ─────────────────────────────────────────────────────────────

/**
 * Carga un gasto. Rechaza un duplicado exacto (mismo proyecto, fecha, monto, moneda y
 * descripción) para que reintentar no lo cargue dos veces.
 */
export async function createExpense(
    ctx: EntryAccessContext,
    input: CreateExpenseInput
): Promise<DomainResult<ExpenseView>> {
    const parsed = createExpenseSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const denied = guardWrite(ctx, "cargar gastos");
    if (denied) return denied;
    const d = parsed.data;

    const project = await prisma.projects.findFirst({
        where: { id: d.project_id, clients: { user_id: ctx.ownerId } },
        select: { id: true },
    });
    if (!project) return fail("not_found", "Proyecto no encontrado.");

    const dup = await prisma.project_expenses.findFirst({
        where: {
            project_id: d.project_id,
            expense_date: d.expense_date,
            amount: d.amount,
            currency: d.currency,
            description: { equals: d.description, mode: "insensitive" },
        },
        select: { id: true },
    });
    if (dup) return fail("conflict", `Ese gasto ya está cargado (${dup.id}).`, { expense_id: dup.id });

    const expense = await prisma.project_expenses.create({
        data: {
            project_id: d.project_id,
            description: d.description,
            supplier: d.supplier || null,
            expense_date: d.expense_date,
            amount: d.amount,
            currency: d.currency,
            billable: d.billable ?? true,
            notes: d.notes || null,
            created_by: ctx.actorId,
        },
        select: { id: true },
    });
    return { ok: true, data: await viewOf(expense.id, false) };
}

/** Edita un gasto no facturado (solo los campos que vengan). */
export async function updateExpense(
    ctx: EntryAccessContext,
    input: UpdateExpenseInput
): Promise<DomainResult<ExpenseView>> {
    const parsed = updateExpenseSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const denied = guardWrite(ctx, "editar gastos");
    if (denied) return denied;
    const { id, ...fields } = parsed.data;
    const patch = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined)
    ) as Omit<typeof parsed.data, "id">;
    if (Object.keys(patch).length === 0) return fail("invalid", "No hay nada para cambiar.");

    const existing = await findOwnedExpense(id, ctx.ownerId);
    if (!existing) return fail("not_found", "Gasto no encontrado.");
    if (existing.invoice_id) return fail("billed", "El gasto ya está facturado: no se puede editar.");

    await prisma.project_expenses.update({
        where: { id },
        data: {
            ...patch,
            ...(patch.supplier !== undefined ? { supplier: patch.supplier || null } : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
        },
    });
    return { ok: true, data: await viewOf(id, false) };
}

/** Borra un gasto no facturado y sus comprobantes. */
export async function deleteExpense(
    ctx: EntryAccessContext,
    id: string
): Promise<DomainResult<{ id: string; project_id: string }>> {
    const denied = guardWrite(ctx, "borrar gastos");
    if (denied) return denied;

    const existing = await findOwnedExpense(id, ctx.ownerId);
    if (!existing) return fail("not_found", "Gasto no encontrado.");
    if (existing.invoice_id) return fail("billed", "El gasto ya está facturado: no se puede borrar.");

    // Los adjuntos se borran por cascade en la DB; los archivos, a mano.
    await prisma.project_expenses.delete({ where: { id } });
    const paths = existing.attachments.map((a) => a.storage_path);
    if (paths.length > 0) {
        await createAdminClient().storage.from(EXPENSE_BUCKET).remove(paths);
    }
    return { ok: true, data: { id, project_id: existing.project_id } };
}

// ─── Comprobantes ───────────────────────────────────────────────────────────

/**
 * Reserva el lugar de un comprobante nuevo en Storage. Se puede adjuntar también a un gasto ya
 * facturado (la factura del proveedor suele llegar después): no cambia la factura.
 */
export async function prepareExpenseAttachment(
    ctx: EntryAccessContext,
    input: { expense_id: string; file_name: string; mime_type: string; size_bytes: number }
): Promise<DomainResult<{ expense_id: string; project_id: string; storage_path: string }>> {
    const parsed = expenseAttachmentUploadSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const denied = guardWrite(ctx, "adjuntar comprobantes");
    if (denied) return denied;

    const expense = await findOwnedExpense(parsed.data.expense_id, ctx.ownerId);
    if (!expense) return fail("not_found", "Gasto no encontrado.");
    return {
        ok: true,
        data: {
            expense_id: expense.id,
            project_id: expense.project_id,
            storage_path: expenseStoragePath(ctx.ownerId, expense.id, randomUUID(), parsed.data.file_name),
        },
    };
}

/** Comprobante recién registrado, con su gasto y proyecto. */
export type RegisteredAttachment = ExpenseAttachmentView & { expense_id: string; project_id: string };

/** Registra un comprobante ya subido a `storage_path` (que emitió prepareExpenseAttachment). */
export async function registerExpenseAttachment(
    ctx: EntryAccessContext,
    input: { expense_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number }
): Promise<DomainResult<RegisteredAttachment>> {
    const parsed = expenseAttachmentUploadSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const denied = guardWrite(ctx, "adjuntar comprobantes");
    if (denied) return denied;

    const expense = await findOwnedExpense(parsed.data.expense_id, ctx.ownerId);
    if (!expense) return fail("not_found", "Gasto no encontrado.");

    // Solo se acepta un archivo de la carpeta de ESTE gasto (no de otro gasto ni de otro tenant).
    const folder = `${ctx.ownerId}/${expense.id}`;
    const { storage_path } = input;
    if (!storage_path.startsWith(`${folder}/`) || storage_path.includes("..")) {
        return fail("invalid", "Archivo inválido.");
    }
    const fileName = storage_path.slice(folder.length + 1);
    const { data: listed } = await createAdminClient()
        .storage.from(EXPENSE_BUCKET)
        .list(folder, { search: fileName });
    if (!listed?.some((f) => f.name === fileName)) {
        return fail("invalid", "El archivo no se terminó de subir.");
    }

    const a = await prisma.project_expense_attachments.create({
        data: {
            expense_id: expense.id,
            storage_path,
            file_name: parsed.data.file_name,
            mime_type: parsed.data.mime_type,
            size_bytes: parsed.data.size_bytes,
        },
    });
    return {
        ok: true,
        data: {
            id: a.id,
            file_name: a.file_name,
            mime_type: a.mime_type,
            size_bytes: a.size_bytes,
            url: null,
            expense_id: expense.id,
            project_id: expense.project_id,
        },
    };
}

/** Sube un comprobante desde el servidor (la API manda el archivo en base64). */
export async function uploadExpenseAttachment(
    ctx: EntryAccessContext,
    input: { expense_id: string; file_name: string; mime_type: string; content: Buffer }
): Promise<DomainResult<RegisteredAttachment>> {
    const meta = { ...input, size_bytes: input.content.length };
    const prep = await prepareExpenseAttachment(ctx, meta);
    if (!prep.ok) return prep;

    const { error } = await createAdminClient()
        .storage.from(EXPENSE_BUCKET)
        .upload(prep.data.storage_path, input.content, { contentType: input.mime_type });
    if (error) {
        console.error("[expenses] upload", error);
        return fail("invalid", "No se pudo subir el archivo a Storage.");
    }
    return registerExpenseAttachment(ctx, { ...meta, storage_path: prep.data.storage_path });
}

/** Quita un comprobante (de la DB y de Storage). */
export async function deleteExpenseAttachment(
    ctx: EntryAccessContext,
    id: string
): Promise<DomainResult<{ id: string; project_id: string }>> {
    const denied = guardWrite(ctx, "borrar comprobantes");
    if (denied) return denied;

    const attachment = await prisma.project_expense_attachments.findFirst({
        where: { id, expense: { projects: { clients: { user_id: ctx.ownerId } } } },
        include: { expense: { select: { project_id: true } } },
    });
    if (!attachment) return fail("not_found", "Comprobante no encontrado.");

    await prisma.project_expense_attachments.delete({ where: { id } });
    await createAdminClient().storage.from(EXPENSE_BUCKET).remove([attachment.storage_path]);
    return { ok: true, data: { id, project_id: attachment.expense.project_id } };
}

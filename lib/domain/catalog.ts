/**
 * Clientes y proyectos para la API de agentes (MCP): alta y edición de su configuración, y el
 * recálculo que dispara un cambio de tarifa (compartido con las Server Actions de la app).
 *
 * ⚠️ NO es "use server" (recibe el contexto por parámetro). Regla de Oro #1: todo filtra por
 * `ctx.ownerId`. Solo el owner del workspace crea o edita (igual que en la app), y los campos de
 * plata (tarifas, moneda, facturable, tipo de facturación) piden además `ctx.financials`.
 * Regla de Oro #3: la tarifa se resuelve en cascada con `resolveRate`.
 */

import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { canManageWorkspace } from "@/lib/auth/owner-context";
import { resolveRate } from "@/lib/utils/rates";
import { zodErrorMessage } from "@/lib/validations/utils";
import {
    apiCreateClientSchema,
    apiCreateProjectSchema,
    apiUpdateClientSchema,
    apiUpdateProjectSchema,
    type ApiCreateClientInput,
    type ApiCreateProjectInput,
    type ApiUpdateClientInput,
    type ApiUpdateProjectInput,
} from "@/lib/validations/api-catalog";
import { AUTONOMOUS_TASK_NAME, discountedRate, isAutonomousTask } from "./autonomous";
import { fail, type DomainResult, type EntryAccessContext } from "./time-entries";

/** Campos que mueven plata: solo con acceso financiero. */
const MONEY_FIELDS = ["default_rate", "rate", "currency", "is_billable", "billing_type"] as const;

function guard(ctx: EntryAccessContext, input: Record<string, unknown>, what: string): DomainResult<never> | null {
    if (!canManageWorkspace(ctx)) return fail("forbidden", `Solo el dueño del workspace puede ${what}.`);
    const money = MONEY_FIELDS.filter((f) => input[f] !== undefined);
    if (money.length && !ctx.financials) {
        return fail("forbidden", `Cambiar ${money.join(", ")} requiere una API key con acceso financiero.`);
    }
    return null;
}

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? null : Number(d));

// ─── Recálculo por cambio de tarifa ─────────────────────────────────────────

/**
 * La tarea "Trabajo autónomo" tiene su propia tarifa: la efectiva del proyecto con descuento. Si
 * cambia la tarifa del proyecto o la del cliente, se vuelve a calcular para que siga el cambio.
 */
export async function syncAutonomousRates(ownerId: string, filter: { projectId?: string; clientId?: string }) {
    const projects = await prisma.projects.findMany({
        where: {
            clients: { user_id: ownerId },
            ...(filter.projectId ? { id: filter.projectId } : {}),
            ...(filter.clientId ? { client_id: filter.clientId } : {}),
        },
        select: {
            rate: true,
            clients: { select: { default_rate: true } },
            tasks: { where: { name: AUTONOMOUS_TASK_NAME }, select: { id: true, name: true } },
        },
    });
    for (const p of projects) {
        const rate = discountedRate(num(p.rate ?? p.clients.default_rate));
        for (const t of p.tasks.filter((t) => isAutonomousTask(t.name))) {
            await prisma.tasks.update({ where: { id: t.id }, data: { rate } });
        }
    }
}

/**
 * Recalcula tarifa y monto de las horas TERMINADAS y NO facturadas del filtro (de todo el equipo:
 * cuando el owner cambia una tarifa, cambian también las horas de los team members). Las
 * facturadas quedan intactas (inmutabilidad histórica).
 */
export async function recalculateUnbilled(ownerId: string, filter: { taskId?: string; projectId?: string; clientId?: string }) {
    if (filter.projectId || filter.clientId) await syncAutonomousRates(ownerId, filter);
    const entries = await prisma.time_entries.findMany({
        where: {
            tasks: {
                ...(filter.taskId && { id: filter.taskId }),
                ...(filter.projectId && { project_id: filter.projectId }),
                projects: {
                    ...(filter.clientId && { client_id: filter.clientId }),
                    clients: { user_id: ownerId },
                },
            },
            is_billed: false,
            end_time: { not: null },
        },
        include: { tasks: { include: { projects: { include: { clients: true } } } } },
    });

    for (const entry of entries) {
        const task = entry.tasks;
        const project = task.projects;
        const client = project.clients;
        const isBillable = !!(task as any).is_billable && !!(project as any).is_billable && !!(client as any).is_billable;
        const { rate } = resolveRate({ task, project, client });
        const effectiveRate = isBillable ? (rate ?? 0) : 0;
        const durationNeto = entry.duration_neto || 0;
        const amount = effectiveRate === 0 ? 0 : Number(((durationNeto / 60) * effectiveRate).toFixed(2));
        await prisma.time_entries.update({
            where: { id: entry.id },
            data: { rate_applied: effectiveRate, amount, billable: effectiveRate > 0, updated_at: new Date() },
        });
    }
    return entries.length;
}

// ─── Vistas ─────────────────────────────────────────────────────────────────

const clientSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    address: true,
    notes: true,
    currency: true,
    default_rate: true,
    is_billable: true,
    tax_id: true,
    business_name: true,
    legal_address: true,
    tax_condition: true,
    web_access_enabled: true,
} satisfies Prisma.clientsSelect;

type ClientRow = Prisma.clientsGetPayload<{ select: typeof clientSelect }>;

function clientView(c: ClientRow, financials: boolean) {
    const { default_rate, currency, ...rest } = c;
    return { ...rest, ...(financials ? { currency, default_rate: num(default_rate) } : {}) };
}

const projectSelect = {
    id: true,
    name: true,
    description: true,
    status: true,
    billing_type: true,
    currency: true,
    rate: true,
    start_date: true,
    end_date: true,
    is_billable: true,
    clients: { select: { id: true, name: true } },
} satisfies Prisma.projectsSelect;

type ProjectRow = Prisma.projectsGetPayload<{ select: typeof projectSelect }>;

function projectView(p: ProjectRow, financials: boolean) {
    const { clients, rate, currency, billing_type, start_date, end_date, ...rest } = p;
    return {
        ...rest,
        client: clients,
        start_date: start_date ? start_date.toISOString().slice(0, 10) : null,
        end_date: end_date ? end_date.toISOString().slice(0, 10) : null,
        ...(financials ? { currency, billing_type, rate: num(rate) } : {}),
    };
}

/** Detalle de un cliente (con datos fiscales y de contacto). */
export async function getClient(ctx: EntryAccessContext, clientId: string): Promise<DomainResult<ReturnType<typeof clientView>>> {
    const c = await prisma.clients.findFirst({ where: { id: clientId, user_id: ctx.ownerId }, select: clientSelect });
    return c ? { ok: true, data: clientView(c, ctx.financials) } : fail("not_found", "Cliente no encontrado.");
}

/** Detalle de un proyecto. */
export async function getProject(ctx: EntryAccessContext, projectId: string): Promise<DomainResult<ReturnType<typeof projectView>>> {
    const p = await prisma.projects.findFirst({ where: { id: projectId, clients: { user_id: ctx.ownerId } }, select: projectSelect });
    return p ? { ok: true, data: projectView(p, ctx.financials) } : fail("not_found", "Proyecto no encontrado.");
}

// ─── Clientes ───────────────────────────────────────────────────────────────

/** "" en el email significa "sin email". */
const cleanEmail = <T extends { email?: string | null }>(d: T): T => (d.email === "" ? { ...d, email: null } : d);

export async function createClient(ctx: EntryAccessContext, input: ApiCreateClientInput) {
    const parsed = apiCreateClientSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const denied = guard(ctx, parsed.data, "crear clientes");
    if (denied) return denied;

    const dup = await prisma.clients.findFirst({
        where: { user_id: ctx.ownerId, name: { equals: parsed.data.name, mode: "insensitive" } },
        select: { id: true },
    });
    if (dup) return fail("conflict", `Ya existe un cliente llamado "${parsed.data.name}" (${dup.id}).`);

    const data = cleanEmail(parsed.data);
    const client = await prisma.clients.create({
        data: { ...data, user_id: ctx.ownerId, currency: data.currency ?? "USD" },
        select: clientSelect,
    });
    return { ok: true as const, data: clientView(client, ctx.financials) };
}

/**
 * Edita la configuración de un cliente. Si deja de ser facturable, sus proyectos y tareas también
 * (herencia, como en la app). Un cambio de tarifa o facturabilidad recalcula las horas sin facturar.
 * El acceso al portal (email de login, contraseña) se maneja desde la app, no desde acá.
 */
export async function updateClient(ctx: EntryAccessContext, input: ApiUpdateClientInput) {
    const parsed = apiUpdateClientSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const { client_id, ...patch } = cleanEmail(parsed.data);
    const denied = guard(ctx, patch, "editar clientes");
    if (denied) return denied;

    const existing = await prisma.clients.findFirst({ where: { id: client_id, user_id: ctx.ownerId }, select: { id: true, portal_user_id: true, email: true } });
    if (!existing) return fail("not_found", "Cliente no encontrado.");
    if (patch.email !== undefined && patch.email !== existing.email && existing.portal_user_id) {
        return fail("forbidden", "El cliente tiene acceso al portal con ese email: cambialo desde la app (sincroniza el login).");
    }
    if (Object.keys(patch).length === 0) return fail("invalid", "No hay nada para cambiar.");

    if (patch.is_billable === false) {
        await prisma.projects.updateMany({ where: { client_id }, data: { is_billable: false } });
        await prisma.tasks.updateMany({ where: { projects: { client_id } }, data: { is_billable: false } });
    }
    const client = await prisma.clients.update({ where: { id: client_id }, data: patch, select: clientSelect });
    const recalculated = patch.default_rate !== undefined || patch.is_billable !== undefined
        ? await recalculateUnbilled(ctx.ownerId, { clientId: client_id })
        : 0;
    return { ok: true as const, data: { client: clientView(client, ctx.financials), recalculated_entries: recalculated } };
}

// ─── Proyectos ──────────────────────────────────────────────────────────────

export async function createProject(ctx: EntryAccessContext, input: ApiCreateProjectInput) {
    const parsed = apiCreateProjectSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const denied = guard(ctx, parsed.data, "crear proyectos");
    if (denied) return denied;

    const client = await prisma.clients.findFirst({
        where: { id: parsed.data.client_id, user_id: ctx.ownerId },
        select: { id: true, currency: true, is_billable: true },
    });
    if (!client) return fail("not_found", "Cliente no encontrado.");
    const dup = await prisma.projects.findFirst({
        where: { client_id: client.id, name: { equals: parsed.data.name, mode: "insensitive" } },
        select: { id: true },
    });
    if (dup) return fail("conflict", `Ese cliente ya tiene un proyecto llamado "${parsed.data.name}" (${dup.id}).`);

    const project = await prisma.projects.create({
        data: {
            ...parsed.data,
            currency: parsed.data.currency ?? client.currency,
            billing_type: parsed.data.billing_type ?? "hourly",
            status: parsed.data.status ?? "active",
            // Herencia: un cliente no facturable no tiene proyectos facturables.
            ...(client.is_billable === false ? { is_billable: false } : {}),
        },
        select: projectSelect,
    });
    return { ok: true as const, data: projectView(project, ctx.financials) };
}

/**
 * Edita la configuración de un proyecto (también lo reasigna a otro cliente del workspace). Igual
 * que en la app: no se puede activar la facturabilidad si el cliente no factura; si deja de ser
 * facturable, sus tareas también; un cambio de tarifa, facturabilidad o cliente recalcula las horas
 * sin facturar (las facturas emitidas conservan su cliente).
 */
export async function updateProject(ctx: EntryAccessContext, input: ApiUpdateProjectInput) {
    const parsed = apiUpdateProjectSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const { project_id, ...patch } = parsed.data;
    const denied = guard(ctx, patch, "editar proyectos");
    if (denied) return denied;
    if (Object.keys(patch).length === 0) return fail("invalid", "No hay nada para cambiar.");

    const existing = await prisma.projects.findFirst({
        where: { id: project_id, clients: { user_id: ctx.ownerId } },
        select: { id: true, client_id: true },
    });
    if (!existing) return fail("not_found", "Proyecto no encontrado.");

    const moving = patch.client_id !== undefined && patch.client_id !== existing.client_id;
    const targetClient = await prisma.clients.findFirst({
        where: { id: patch.client_id ?? existing.client_id, user_id: ctx.ownerId },
        select: { is_billable: true },
    });
    if (!targetClient) return fail("not_found", "El cliente destino no existe o no pertenece a tu workspace.");
    if (patch.is_billable === true && targetClient.is_billable === false) {
        return fail("invalid", "No se puede marcar como facturable: el cliente no es facturable.");
    }
    const data = moving && targetClient.is_billable === false ? { ...patch, is_billable: false } : patch;

    if (data.is_billable === false) {
        await prisma.tasks.updateMany({ where: { project_id }, data: { is_billable: false } });
    }
    const project = await prisma.projects.update({ where: { id: project_id }, data, select: projectSelect });
    const recalculated = data.rate !== undefined || data.is_billable !== undefined || moving
        ? await recalculateUnbilled(ctx.ownerId, { projectId: project_id })
        : 0;
    return { ok: true as const, data: { project: projectView(project, ctx.financials), recalculated_entries: recalculated } };
}

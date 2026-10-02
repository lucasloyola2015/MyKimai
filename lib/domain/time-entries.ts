/**
 * Capa de dominio de horas (time_entries) — independiente de cómo se autentica
 * el caller. Las Server Actions (sesión web) y la API de agentes (API key) la
 * usan con un contexto ya resuelto.
 *
 * ⚠️ NO es un archivo "use server": sus funciones reciben el contexto como
 * parámetro, así que exponerlas como Server Actions permitiría falsificarlo.
 *
 * Regla de Oro #1: Prisma bypasea la RLS → todo filtra por `ownerId` / `actorId`.
 * Regla de Oro #2: la plata NO se calcula acá; se persiste `rate_applied`
 * (resolveRate) y el trigger de la DB calcula duración neta y `amount`.
 */

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { canSeeFinancials, type OwnerContext } from "@/lib/auth/owner-context";
import { resolveRate } from "@/lib/utils/rates";
import { getUsdExchangeRate } from "@/lib/actions/exchange";
import { zodErrorMessage } from "@/lib/validations/utils";
import {
    apiCheckTimeSlotSchema,
    apiCreateEntrySchema,
    apiListEntriesSchema,
    apiUpdateEntrySchema,
    checkEntryRange,
    type ApiCheckTimeSlotInput,
    type ApiCreateEntryInput,
    type ApiListEntriesInput,
    type ApiUpdateEntryInput,
} from "@/lib/validations/api-entries";
import { judgeOverlaps, type OverlapView } from "./overlaps";
import { AUTONOMOUS_TASK_NAME, autonomousTitle, discountedRate, isAutonomousTask } from "./autonomous";

// ─── Helpers compartidos con las Server Actions ─────────────────────────────

/**
 * Calcula la tarifa aplicable para una tarea usando resolveRate (SSOT).
 * Aplica el blindaje de facturabilidad antes de la cascada.
 */
export async function calculateRate(taskId: string): Promise<number> {
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            projects: {
                include: {
                    clients: true,
                },
            },
        },
    });

    if (!task) return 0;

    const isBillable = !!(task as any).is_billable && !!(task.projects as any).is_billable && !!(task.projects.clients as any).is_billable;
    if (!isBillable) return 0;

    const { rate } = resolveRate({
        task,
        project: task.projects,
        client: task.projects.clients,
    });

    return rate ?? 0;
}

/**
 * §4.3 — Encuentra el paquete de horas que debe consumir una entrada facturable.
 * Reglas: paquete del mismo cliente, y del proyecto si el paquete es por-proyecto
 * (los paquetes con project_id NULL aplican a todo el cliente); no vencido; con
 * saldo disponible (hours_used < hours). Prefiere el paquete POR-PROYECTO sobre el
 * general del cliente, y dentro de cada grupo elige FIFO (el comprado primero).
 * Devuelve el id del paquete o null si no hay ninguno elegible.
 */
export async function findPackageForEntry(
    clientId: string,
    projectId: string
): Promise<string | null> {
    const candidates = await prisma.hour_packages.findMany({
        where: {
            client_id: clientId,
            OR: [{ project_id: null }, { project_id: projectId }],
        },
    });

    const now = new Date();
    const eligible = candidates
        .filter((p) => !p.expires_at || p.expires_at >= now)
        .filter((p) => Number(p.hours) - Number(p.hours_used) > 0)
        .sort((a, b) => {
            const aProj = a.project_id ? 0 : 1;
            const bProj = b.project_id ? 0 : 1;
            if (aProj !== bProj) return aProj - bProj; // proyecto-específico primero
            return new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime(); // FIFO
        });

    return eligible[0]?.id ?? null;
}

/**
 * §sin-tareas — Resuelve la "tarea contenedora" de un proyecto.
 *
 * Las tareas ya no se eligen desde la UI: el detalle real de cada sesión vive en
 * `time_entries.title`. Pero `tasks` sigue siendo el vínculo entre las horas y su
 * proyecto/cliente (lo usan todas las consultas de scoping y facturación), así que
 * cada proyecto necesita una tarea que sostenga esa relación.
 *
 * Estrategia (en orden): usar una tarea llamada "General" si existe; si no, y el
 * proyecto tiene exactamente UNA tarea, reutilizarla (continuidad con los datos
 * actuales); en cualquier otro caso, crear "General".
 */
export async function resolveContainerTaskId(projectId: string, ownerId: string): Promise<string | null> {
    const project = await prisma.projects.findFirst({
        where: { id: projectId, clients: { user_id: ownerId } },
        select: { id: true, is_billable: true, tasks: { select: { id: true, name: true } } },
    });
    if (!project) return null;

    // La tarea "Trabajo autónomo" no es contenedora: tiene su propia tarifa con descuento.
    const tasks = project.tasks.filter((t) => !isAutonomousTask(t.name));
    const general = tasks.find((t) => t.name === "General");
    if (general) return general.id;
    if (tasks.length === 1) return tasks[0].id;

    const created = await prisma.tasks.create({
        data: {
            project_id: projectId,
            name: "General",
            is_billable: (project as any).is_billable ?? true,
        },
        select: { id: true },
    });
    return created.id;
}

/**
 * Tarea "Trabajo autónomo" del proyecto (trabajo de agentes sin el usuario, p. ej. de madrugada).
 * Si no existe se crea con la tarifa efectiva del proyecto (proyecto, si no cliente) con descuento
 * (AUTONOMOUS_DISCOUNT). Si no hay tarifa de referencia queda sin precio y la cascada usa la del
 * cliente.
 */
export async function resolveAutonomousTaskId(projectId: string, ownerId: string): Promise<string | null> {
    const project = await prisma.projects.findFirst({
        where: { id: projectId, clients: { user_id: ownerId } },
        select: {
            id: true,
            is_billable: true,
            rate: true,
            clients: { select: { default_rate: true } },
            tasks: { select: { id: true, name: true } },
        },
    });
    if (!project) return null;

    const existing = project.tasks.find((t) => isAutonomousTask(t.name));
    if (existing) return existing.id;

    const effective = project.rate ?? project.clients.default_rate;
    const created = await prisma.tasks.create({
        data: {
            project_id: projectId,
            name: AUTONOMOUS_TASK_NAME,
            is_billable: project.is_billable ?? true,
            rate: discountedRate(effective != null ? Number(effective) : null),
        },
        select: { id: true },
    });
    return created.id;
}

// ─── API de agentes ─────────────────────────────────────────────────────────

/** Contexto de la API: owner context + si puede ver datos financieros. */
export interface EntryAccessContext extends OwnerContext {
    /** Ver montos/tarifas. Para API keys: scope 'financials' Y rol owner/admin. */
    financials: boolean;
    /** API key que origina la escritura (trazabilidad en time_entries). */
    apiKeyId?: string;
}

export type DomainErrorCode = "invalid" | "not_found" | "forbidden" | "billed" | "conflict";

export type DomainResult<T> =
    | { ok: true; data: T }
    | { ok: false; code: DomainErrorCode; error: string; details?: unknown };

export const fail = (code: DomainErrorCode, error: string, details?: unknown): DomainResult<never> => ({
    ok: false,
    code,
    error,
    details,
});

export interface ProjectView {
    id: string;
    name: string;
    status: string;
    is_billable: boolean;
    currency: string;
    client: { id: string; name: string };
}

export interface EntryView {
    id: string;
    user_id: string;
    client: { id: string; name: string };
    project: { id: string; name: string };
    title: string | null;
    description: string | null;
    start_time: string;
    end_time: string | null;
    /** Minutos netos (descontadas pausas). null si el timer sigue corriendo. */
    duration_minutes: number | null;
    break_minutes: number;
    billable: boolean;
    is_billed: boolean;
    hour_package_id: string | null;
    source: string;
    external_ref: string | null;
    /** Trabajo autónomo de un agente (tarea "Trabajo autónomo", tarifa con descuento). */
    autonomous: boolean;
    /** Solo con acceso financiero. */
    rate_applied?: number | null;
    amount?: number | null;
    currency?: string;
}

const entryInclude = {
    tasks: {
        select: {
            name: true,
            projects: {
                select: {
                    id: true,
                    name: true,
                    currency: true,
                    client_id: true,
                    clients: { select: { id: true, name: true, user_id: true } },
                },
            },
        },
    },
    time_entry_breaks: { select: { start_time: true, end_time: true } },
} satisfies Prisma.time_entriesInclude;

type EntryWithRelations = Prisma.time_entriesGetPayload<{ include: typeof entryInclude }>;

function toEntryView(entry: EntryWithRelations, financials: boolean): EntryView {
    const project = entry.tasks.projects;
    const view: EntryView = {
        id: entry.id,
        user_id: entry.user_id,
        client: { id: project.clients.id, name: project.clients.name },
        project: { id: project.id, name: project.name },
        title: entry.title ?? entry.tasks.name ?? null,
        description: entry.description,
        start_time: entry.start_time.toISOString(),
        end_time: entry.end_time ? entry.end_time.toISOString() : null,
        duration_minutes: entry.end_time ? entry.duration_neto ?? 0 : null,
        break_minutes: entry.end_time
            ? Math.max((entry.duration_total ?? 0) - (entry.duration_neto ?? 0), 0)
            : 0,
        billable: entry.billable,
        is_billed: entry.is_billed,
        hour_package_id: entry.consumed_from_package_id,
        source: entry.source,
        external_ref: entry.external_ref,
        autonomous: isAutonomousTask(entry.tasks.name),
    };
    if (financials) {
        view.rate_applied = entry.rate_applied != null ? Number(entry.rate_applied) : null;
        view.amount = entry.amount != null ? Number(entry.amount) : null;
        view.currency = project.currency;
    }
    return view;
}

/** Proyectos del workspace (para que el agente elija dónde cargar). */
export async function listProjects(
    ctx: EntryAccessContext,
    opts: { clientId?: string; includeInactive?: boolean } = {}
): Promise<ProjectView[]> {
    const projects = await prisma.projects.findMany({
        where: {
            clients: { user_id: ctx.ownerId },
            ...(opts.clientId ? { client_id: opts.clientId } : {}),
            ...(opts.includeInactive ? {} : { status: "active" as const }),
        },
        select: {
            id: true,
            name: true,
            status: true,
            is_billable: true,
            currency: true,
            clients: { select: { id: true, name: true } },
        },
        orderBy: [{ clients: { name: "asc" } }, { name: "asc" }],
    });

    return projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        is_billable: p.is_billable,
        currency: p.currency,
        client: { id: p.clients.id, name: p.clients.name },
    }));
}

const MAX_LIST_ENTRIES = 1000;

/**
 * Horas de un rango. `scope: 'mine'` (default) = las del actor; `'workspace'` =
 * las de todo el equipo, solo para owner/admin (un collaborator ve solo las suyas).
 */
export async function listEntries(
    ctx: EntryAccessContext,
    input: ApiListEntriesInput
): Promise<DomainResult<{ entries: EntryView[]; truncated: boolean }>> {
    const parsed = apiListEntriesSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const { from, to, project_id, client_id, scope } = parsed.data;

    if (scope === "workspace" && !canSeeFinancials(ctx)) {
        return fail("forbidden", "Tu rol solo puede consultar sus propias horas (scope 'mine').");
    }

    const entries = await prisma.time_entries.findMany({
        where: {
            ...(scope === "mine" ? { user_id: ctx.actorId } : {}),
            start_time: { gte: from, lte: to },
            tasks: {
                projects: {
                    clients: { user_id: ctx.ownerId },
                    ...(client_id ? { client_id } : {}),
                    ...(project_id ? { id: project_id } : {}),
                },
            },
        },
        include: entryInclude,
        orderBy: { start_time: "asc" },
        take: MAX_LIST_ENTRIES + 1,
    });

    const truncated = entries.length > MAX_LIST_ENTRIES;
    return {
        ok: true,
        data: {
            entries: entries.slice(0, MAX_LIST_ENTRIES).map((e) => toEntryView(e, ctx.financials)),
            truncated,
        },
    };
}

/**
 * Horas propias que se solapan con [start, end) (los timers en curso cuentan
 * hasta ahora). `same_project` marca las del proyecto `projectId`.
 */
async function findOverlaps(
    actorId: string,
    start: Date,
    end: Date,
    projectId: string | null,
    excludeId?: string
): Promise<OverlapView[]> {
    const rows = await prisma.time_entries.findMany({
        where: {
            user_id: actorId,
            ...(excludeId ? { id: { not: excludeId } } : {}),
            start_time: { lt: end },
            OR: [{ end_time: null }, { end_time: { gt: start } }],
        },
        select: {
            id: true,
            title: true,
            start_time: true,
            end_time: true,
            tasks: { select: { name: true, projects: { select: { id: true, name: true } } } },
        },
        orderBy: { start_time: "asc" },
        take: 20,
    });
    return rows.map((r) => ({
        id: r.id,
        title: r.title ?? r.tasks.name,
        project_id: r.tasks.projects.id,
        project: r.tasks.projects.name,
        start_time: r.start_time.toISOString(),
        end_time: r.end_time ? r.end_time.toISOString() : null,
        same_project: projectId !== null && r.tasks.projects.id === projectId,
    }));
}

async function projectInWorkspace(projectId: string, ownerId: string): Promise<boolean> {
    const project = await prisma.projects.findFirst({
        where: { id: projectId, clients: { user_id: ownerId } },
        select: { id: true },
    });
    return project !== null;
}

/**
 * Horas propias ya registradas en un horario. El agente la usa ANTES de proponer
 * una carga, para preguntarle al usuario qué hacer con los solapamientos.
 */
export async function checkTimeSlot(
    ctx: EntryAccessContext,
    input: ApiCheckTimeSlotInput
): Promise<DomainResult<{ overlaps: OverlapView[] }>> {
    const parsed = apiCheckTimeSlotSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const { start_time, end_time, project_id, exclude_entry_id } = parsed.data;
    const overlaps = await findOverlaps(
        ctx.actorId,
        start_time,
        end_time,
        project_id ?? null,
        exclude_entry_id
    );
    return { ok: true, data: { overlaps } };
}

/**
 * Tarifa, cotización y paquete para una entrada TERMINADA en `taskId`
 * (mismo criterio que `stopTimeEntry`).
 */
async function pricingFor(taskId: string) {
    const task = await prisma.tasks.findUniqueOrThrow({
        where: { id: taskId },
        select: { project_id: true, projects: { select: { client_id: true } } },
    });
    const rate = await calculateRate(taskId);
    const consumedPackageId =
        rate > 0 ? await findPackageForEntry(task.projects.client_id, task.project_id) : null;
    return {
        rate_applied: rate,
        billable: rate > 0,
        consumed_from_package_id: consumedPackageId,
        usd_exchange_rate: await getUsdExchangeRate(),
    };
}

/**
 * Crea una entrada TERMINADA (inicio y fin) en un proyecto, marcada como
 * `source = 'api'`. Si `external_ref` ya existe para el actor, actualiza esa
 * entrada (idempotente: re-correr el skill no duplica).
 */
export async function createEntry(
    ctx: EntryAccessContext,
    input: ApiCreateEntryInput
): Promise<DomainResult<{ entry: EntryView; created: boolean }>> {
    const parsed = apiCreateEntrySchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const data = parsed.data;

    if (data.external_ref) {
        const existing = await prisma.time_entries.findFirst({
            where: { user_id: ctx.actorId, external_ref: data.external_ref },
            select: { id: true },
        });
        if (existing) {
            const updated = await updateEntry(ctx, {
                entry_id: existing.id,
                project_id: data.project_id,
                title: data.title,
                description: data.description,
                start_time: data.start_time.toISOString(),
                end_time: data.end_time.toISOString(),
                allow_overlap: data.allow_overlap,
                autonomous: data.autonomous,
            });
            return updated.ok ? { ok: true, data: { entry: updated.data, created: false } } : updated;
        }
    }

    const rangeError = checkEntryRange(data.start_time, data.end_time);
    if (rangeError) return fail("invalid", rangeError);

    if (!(await projectInWorkspace(data.project_id, ctx.ownerId))) {
        return fail("not_found", "Proyecto no encontrado o fuera de tu workspace.");
    }

    const verdict = judgeOverlaps(
        await findOverlaps(ctx.actorId, data.start_time, data.end_time, data.project_id),
        data.allow_overlap
    );
    if (!verdict.ok) {
        return fail("conflict", verdict.error, { reason: verdict.reason, overlaps: verdict.overlaps });
    }

    const taskId = data.autonomous
        ? await resolveAutonomousTaskId(data.project_id, ctx.ownerId)
        : await resolveContainerTaskId(data.project_id, ctx.ownerId);
    if (!taskId) return fail("not_found", "Proyecto no encontrado o fuera de tu workspace.");

    try {
        const entry = await prisma.time_entries.create({
            data: {
                user_id: ctx.actorId,
                task_id: taskId,
                title: data.autonomous ? autonomousTitle(data.title) : data.title,
                description: data.description ?? null,
                start_time: data.start_time,
                end_time: data.end_time,
                ...(await pricingFor(taskId)),
                source: "api",
                api_key_id: ctx.apiKeyId ?? null,
                external_ref: data.external_ref ?? null,
            },
            include: entryInclude,
        });
        return { ok: true, data: { entry: toEntryView(entry, ctx.financials), created: true } };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            return fail("conflict", "Ya existe una entrada con ese external_ref.");
        }
        throw error;
    }
}

/**
 * Edita una entrada PROPIA y no facturada. Cambiar de proyecto recalcula tarifa
 * y paquete (como al frenar un timer). A un timer en curso solo se le puede
 * cambiar título y descripción.
 */
export async function updateEntry(
    ctx: EntryAccessContext,
    input: ApiUpdateEntryInput
): Promise<DomainResult<EntryView>> {
    const parsed = apiUpdateEntrySchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const patch = parsed.data;

    const entry = await prisma.time_entries.findUnique({
        where: { id: patch.entry_id },
        include: entryInclude,
    });
    if (!entry || entry.tasks.projects.clients.user_id !== ctx.ownerId) {
        return fail("not_found", "Entrada no encontrada.");
    }
    if (entry.user_id !== ctx.actorId) {
        return fail("forbidden", "Solo podés editar tus propias horas.");
    }
    if (entry.is_billed || entry.invoice_id) {
        return fail("billed", "La entrada ya está facturada; no se puede modificar.");
    }

    const changesProject =
        patch.project_id !== undefined && patch.project_id !== entry.tasks.projects.id;
    const changesTimes = patch.start_time !== undefined || patch.end_time !== undefined;
    const wasAutonomous = isAutonomousTask(entry.tasks.name);
    const autonomous = patch.autonomous ?? wasAutonomous;
    const changesTask = changesProject || autonomous !== wasAutonomous;

    if (!entry.end_time && (changesTimes || changesTask)) {
        return fail(
            "invalid",
            "El timer sigue en curso: solo se pueden cambiar título y descripción. Frenalo desde la app."
        );
    }

    const data: Prisma.time_entriesUncheckedUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
    // El trabajo autónomo siempre lleva el prefijo "Trabajo autónomo: " en el título; al dejar de
    // serlo, se le quita.
    const finalTitle = (patch.title ?? entry.title ?? entry.tasks.name ?? "").trim();
    if (autonomous && finalTitle) {
        const t = autonomousTitle(finalTitle);
        if (t !== finalTitle || patch.title !== undefined) data.title = t;
    } else if (!autonomous && wasAutonomous && isAutonomousTask(finalTitle.split(":")[0])) {
        data.title = finalTitle.slice(finalTitle.indexOf(":") + 1).trim() || finalTitle;
    }

    if (changesTimes || changesProject) {
        const start = patch.start_time ?? entry.start_time;
        const end = patch.end_time ?? entry.end_time!;
        const rangeError = checkEntryRange(start, end);
        if (rangeError) return fail("invalid", rangeError);

        const targetProjectId = patch.project_id ?? entry.tasks.projects.id;
        if (changesProject && !(await projectInWorkspace(targetProjectId, ctx.ownerId))) {
            return fail("not_found", "Proyecto no encontrado o fuera de tu workspace.");
        }

        const verdict = judgeOverlaps(
            await findOverlaps(ctx.actorId, start, end, targetProjectId, entry.id),
            patch.allow_overlap
        );
        if (!verdict.ok) {
            return fail("conflict", verdict.error, { reason: verdict.reason, overlaps: verdict.overlaps });
        }
        if (changesTimes) {
            data.start_time = start;
            data.end_time = end;
        }
    }

    if (changesTask) {
        const targetProjectId = patch.project_id ?? entry.tasks.projects.id;
        const taskId = autonomous
            ? await resolveAutonomousTaskId(targetProjectId, ctx.ownerId)
            : await resolveContainerTaskId(targetProjectId, ctx.ownerId);
        if (!taskId) return fail("not_found", "Proyecto no encontrado o fuera de tu workspace.");
        data.task_id = taskId;
        Object.assign(data, await pricingFor(taskId));
    }

    // Re-dispara el trigger de duración/monto.
    data.updated_at = new Date();

    const updated = await prisma.time_entries.update({
        where: { id: entry.id },
        data,
        include: entryInclude,
    });
    return { ok: true, data: toEntryView(updated, ctx.financials) };
}

"use server";

import { prisma } from "@/lib/prisma/client";
import {
    getOwnerContext,
    canManageWorkspace,
} from "@/lib/auth/owner-context";
import { getClientContext } from "@/lib/auth/server";
import { getPortalProjectFilter } from "@/lib/auth/portal-context";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
    createMilestoneSchema,
    updateMilestoneSchema,
    deleteMilestoneSchema,
    assignTimeEntryMilestoneSchema,
} from "@/lib/validations/milestones";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

function zodErrorMessage(err: ZodError): string {
    return err.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ");
}

export interface MilestoneView {
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    target_date: string | null;
    status: "planned" | "in_progress" | "completed" | "blocked" | "cancelled";
    completed_at: string | null;
    completion_notes: string | null;
    budget_hours: number | null;
    budget_amount: number | null;
    budget_currency: string | null;
    actual_hours: number | null;
    actual_amount: number | null;
    display_order: number;
    visible_to_client: boolean;
    /** Horas netas acumuladas en time_entries vinculados al hito (en tiempo real). */
    current_hours: number;
    /** Monto acumulado (suma de amount) en time_entries vinculados. */
    current_amount: number;
}

/**
 * Vista admin: todos los hitos del proyecto (incluyendo los no visibles al
 * cliente), con sus métricas en tiempo real.
 */
export async function getProjectMilestones(
    projectId: string
): Promise<MilestoneView[]> {
    const ctx = await getOwnerContext();

    // Confirmar pertenencia al workspace
    const project = await prisma.projects.findFirst({
        where: {
            id: projectId,
            clients: { user_id: ctx.ownerId },
        },
        select: { id: true },
    });
    if (!project) return [];

    const milestones = await prisma.milestones.findMany({
        where: { project_id: projectId },
        include: {
            time_entries: {
                select: { duration_neto: true, amount: true },
            },
        },
        orderBy: [{ display_order: "asc" }, { created_at: "asc" }],
    });

    return milestones.map((m) => {
        const currentMinutes = m.time_entries.reduce(
            (sum, e) => sum + (e.duration_neto ?? 0),
            0
        );
        const currentAmount = m.time_entries.reduce(
            (sum, e) => sum + Number(e.amount ?? 0),
            0
        );
        return {
            id: m.id,
            project_id: m.project_id,
            name: m.name,
            description: m.description,
            target_date: m.target_date?.toISOString() ?? null,
            status: m.status as MilestoneView["status"],
            completed_at: m.completed_at?.toISOString() ?? null,
            completion_notes: m.completion_notes,
            budget_hours: m.budget_hours != null ? Number(m.budget_hours) : null,
            budget_amount:
                m.budget_amount != null ? Number(m.budget_amount) : null,
            budget_currency: m.budget_currency,
            actual_hours: m.actual_hours != null ? Number(m.actual_hours) : null,
            actual_amount:
                m.actual_amount != null ? Number(m.actual_amount) : null,
            display_order: m.display_order,
            visible_to_client: m.visible_to_client,
            current_hours: currentMinutes / 60,
            current_amount: Math.round(currentAmount * 100) / 100,
        };
    });
}

/**
 * Vista portal cliente: solo hitos `visible_to_client = true` del proyecto,
 * y solo si el client_user tiene acceso al proyecto.
 */
export async function getPortalProjectMilestones(
    projectId: string
): Promise<MilestoneView[]> {
    const ctx = await getClientContext();
    if (!ctx) return [];

    const filter = await getPortalProjectFilter();
    if (!filter) return [];

    // Si está restringido y este proyecto no está en la lista accesible, vacío
    if (filter.kind === "restricted" && !filter.projectIds.includes(projectId)) {
        return [];
    }

    // Verificar que el proyecto pertenece al cliente
    const project = await prisma.projects.findFirst({
        where: { id: projectId, client_id: filter.clientId },
        select: { id: true },
    });
    if (!project) return [];

    const milestones = await prisma.milestones.findMany({
        where: { project_id: projectId, visible_to_client: true },
        include: {
            time_entries: {
                select: { duration_neto: true, amount: true },
            },
        },
        orderBy: [{ display_order: "asc" }, { created_at: "asc" }],
    });

    return milestones.map((m) => {
        const currentMinutes = m.time_entries.reduce(
            (sum, e) => sum + (e.duration_neto ?? 0),
            0
        );
        const currentAmount = m.time_entries.reduce(
            (sum, e) => sum + Number(e.amount ?? 0),
            0
        );
        return {
            id: m.id,
            project_id: m.project_id,
            name: m.name,
            description: m.description,
            target_date: m.target_date?.toISOString() ?? null,
            status: m.status as MilestoneView["status"],
            completed_at: m.completed_at?.toISOString() ?? null,
            completion_notes: m.completion_notes,
            budget_hours: m.budget_hours != null ? Number(m.budget_hours) : null,
            budget_amount:
                m.budget_amount != null ? Number(m.budget_amount) : null,
            budget_currency: m.budget_currency,
            actual_hours: m.actual_hours != null ? Number(m.actual_hours) : null,
            actual_amount:
                m.actual_amount != null ? Number(m.actual_amount) : null,
            display_order: m.display_order,
            visible_to_client: m.visible_to_client,
            current_hours: currentMinutes / 60,
            current_amount: Math.round(currentAmount * 100) / 100,
        };
    });
}

export async function createMilestone(
    input: Parameters<typeof createMilestoneSchema.parse>[0]
): Promise<ActionResponse<{ id: string }>> {
    const parsed = createMilestoneSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede crear hitos.",
        };
    }

    // Verificar que el proyecto pertenece al workspace
    const project = await prisma.projects.findFirst({
        where: {
            id: parsed.data.project_id,
            clients: { user_id: ctx.ownerId },
        },
        select: { id: true },
    });
    if (!project) {
        return { success: false, error: "Proyecto no encontrado." };
    }

    try {
        const milestone = await prisma.milestones.create({
            data: {
                project_id: parsed.data.project_id,
                name: parsed.data.name,
                description: parsed.data.description ?? null,
                target_date: parsed.data.target_date ?? null,
                status: parsed.data.status,
                budget_hours: parsed.data.budget_hours ?? null,
                budget_amount: parsed.data.budget_amount ?? null,
                budget_currency: parsed.data.budget_currency ?? null,
                display_order: parsed.data.display_order ?? 0,
                visible_to_client: parsed.data.visible_to_client ?? true,
            },
        });
        revalidatePath(`/dashboard/projects/${parsed.data.project_id}/milestones`);
        return { success: true, data: { id: milestone.id } };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al crear hito.",
        };
    }
}

export async function updateMilestone(
    input: Parameters<typeof updateMilestoneSchema.parse>[0]
): Promise<ActionResponse<void>> {
    const parsed = updateMilestoneSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede editar hitos.",
        };
    }

    const existing = await prisma.milestones.findFirst({
        where: {
            id: parsed.data.id,
            projects: { clients: { user_id: ctx.ownerId } },
        },
        include: {
            time_entries: { select: { duration_neto: true, amount: true } },
        },
    });
    if (!existing) {
        return { success: false, error: "Hito no encontrado." };
    }

    try {
        const updateData: any = {};
        for (const k of [
            "name",
            "description",
            "target_date",
            "status",
            "completion_notes",
            "budget_hours",
            "budget_amount",
            "budget_currency",
            "display_order",
            "visible_to_client",
        ] as const) {
            if ((parsed.data as any)[k] !== undefined) {
                updateData[k] = (parsed.data as any)[k];
            }
        }

        // Si pasa a `completed`, snapshotear actual_hours y actual_amount
        if (
            parsed.data.status === "completed" &&
            existing.status !== "completed"
        ) {
            const totalMinutes = existing.time_entries.reduce(
                (s, e) => s + (e.duration_neto ?? 0),
                0
            );
            const totalAmount = existing.time_entries.reduce(
                (s, e) => s + Number(e.amount ?? 0),
                0
            );
            updateData.completed_at = new Date();
            updateData.actual_hours = Math.round((totalMinutes / 60) * 100) / 100;
            updateData.actual_amount = Math.round(totalAmount * 100) / 100;
        }

        // Si lo reabre, limpiar completed_at (mantener actual_* como historial)
        if (
            parsed.data.status &&
            parsed.data.status !== "completed" &&
            existing.status === "completed"
        ) {
            updateData.completed_at = null;
        }

        await prisma.milestones.update({
            where: { id: parsed.data.id },
            data: updateData,
        });
        revalidatePath(`/dashboard/projects/${existing.project_id}/milestones`);
        return { success: true, data: undefined };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error ? error.message : "Error al actualizar hito.",
        };
    }
}

export async function deleteMilestone(
    id: string
): Promise<ActionResponse<void>> {
    const parsed = deleteMilestoneSchema.safeParse({ id });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede eliminar hitos.",
        };
    }

    const existing = await prisma.milestones.findFirst({
        where: {
            id,
            projects: { clients: { user_id: ctx.ownerId } },
        },
    });
    if (!existing) {
        return { success: false, error: "Hito no encontrado." };
    }

    try {
        // time_entries.milestone_id queda en null por el ON DELETE SET NULL.
        await prisma.milestones.delete({ where: { id } });
        revalidatePath(`/dashboard/projects/${existing.project_id}/milestones`);
        return { success: true, data: undefined };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al eliminar.",
        };
    }
}

/**
 * Asigna (o desasigna pasando null) un time_entry a un milestone del mismo
 * proyecto. Solo el actor original o el owner pueden hacerlo.
 */
export async function assignTimeEntryMilestone(input: {
    entry_id: string;
    milestone_id: string | null;
}): Promise<ActionResponse<void>> {
    const parsed = assignTimeEntryMilestoneSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();

    const entry = await prisma.time_entries.findUnique({
        where: { id: parsed.data.entry_id },
        include: {
            tasks: { include: { projects: { include: { clients: true } } } },
        },
    });
    if (!entry) {
        return { success: false, error: "Time entry no encontrado." };
    }

    const isAuthor = entry.user_id === ctx.actorId;
    const isWorkspaceOwner =
        canManageWorkspace(ctx) &&
        (entry as any).tasks.projects.clients.user_id === ctx.ownerId;
    if (!isAuthor && !isWorkspaceOwner) {
        return { success: false, error: "No autorizado." };
    }

    // Si está asignando, validar que el milestone pertenezca al MISMO proyecto
    if (parsed.data.milestone_id) {
        const milestone = await prisma.milestones.findFirst({
            where: {
                id: parsed.data.milestone_id,
                project_id: (entry as any).tasks.project_id,
            },
            select: { id: true },
        });
        if (!milestone) {
            return {
                success: false,
                error: "El hito no pertenece al mismo proyecto del registro.",
            };
        }
    }

    try {
        await prisma.time_entries.update({
            where: { id: parsed.data.entry_id },
            data: { milestone_id: parsed.data.milestone_id },
        });
        revalidatePath("/dashboard/my-hours");
        return { success: true, data: undefined };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al asignar.",
        };
    }
}

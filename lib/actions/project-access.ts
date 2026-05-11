"use server";

import { prisma } from "@/lib/prisma/client";
import {
    getOwnerContext,
    canManageWorkspace,
} from "@/lib/auth/owner-context";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
    grantProjectAccessSchema,
    updateProjectAccessSchema,
    revokeProjectAccessSchema,
    updateClientUserVisibilitySchema,
} from "@/lib/validations/project-access";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

function zodErrorMessage(err: ZodError): string {
    return err.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ");
}

export interface StakeholderView {
    client_user_id: string;
    email: string;
    sees_all_projects: boolean;
    /** Si tiene project_access para este proyecto, los datos del access. */
    access: {
        id: string;
        role: "viewer" | "manager";
        granted_at: string;
        revoked_at: string | null;
    } | null;
}

/**
 * Lista todos los `client_users` del cliente del proyecto, con su estado
 * de acceso a ese proyecto. Devuelve TODOS los stakeholders (asignados o
 * no), para que el owner pueda decidir.
 */
export async function getProjectStakeholders(
    projectId: string
): Promise<StakeholderView[]> {
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return [];
    }

    const project = await prisma.projects.findFirst({
        where: {
            id: projectId,
            clients: { user_id: ctx.ownerId },
        },
        select: { id: true, client_id: true },
    });
    if (!project) return [];

    const clientUsers = await prisma.client_users.findMany({
        where: { client_id: project.client_id },
        include: {
            project_access: {
                where: { project_id: projectId },
            },
        },
        orderBy: { invited_at: "asc" },
    });

    return clientUsers.map((cu) => {
        const access = cu.project_access[0] ?? null;
        return {
            client_user_id: cu.id,
            email: cu.email,
            sees_all_projects: cu.sees_all_projects,
            access: access
                ? {
                      id: access.id,
                      role: access.role as "viewer" | "manager",
                      granted_at: access.granted_at.toISOString(),
                      revoked_at: access.revoked_at?.toISOString() ?? null,
                  }
                : null,
        };
    });
}

export async function grantProjectAccess(input: {
    project_id: string;
    client_user_id: string;
    role?: "viewer" | "manager";
}): Promise<ActionResponse<{ id: string }>> {
    const parsed = grantProjectAccessSchema.safeParse({
        project_id: input.project_id,
        client_user_id: input.client_user_id,
        role: input.role ?? "viewer",
    });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede asignar accesos.",
        };
    }

    // Validar que el proyecto y el client_user pertenezcan al workspace
    // y al mismo cliente.
    const project = await prisma.projects.findFirst({
        where: {
            id: parsed.data.project_id,
            clients: { user_id: ctx.ownerId },
        },
        select: { id: true, client_id: true },
    });
    if (!project) {
        return { success: false, error: "Proyecto no encontrado." };
    }

    const clientUser = await prisma.client_users.findFirst({
        where: {
            id: parsed.data.client_user_id,
            client_id: project.client_id,
        },
        select: { id: true },
    });
    if (!clientUser) {
        return {
            success: false,
            error: "El stakeholder no pertenece al cliente del proyecto.",
        };
    }

    try {
        // upsert: si ya hay registro (con revoked_at o sin él) actualiza;
        // si no, crea.
        const existing = await prisma.project_access.findUnique({
            where: {
                project_id_client_user_id: {
                    project_id: parsed.data.project_id,
                    client_user_id: parsed.data.client_user_id,
                },
            },
        });

        let access;
        if (existing) {
            access = await prisma.project_access.update({
                where: { id: existing.id },
                data: {
                    role: parsed.data.role,
                    granted_at: new Date(),
                    granted_by: ctx.ownerId,
                    revoked_at: null,
                },
            });
        } else {
            access = await prisma.project_access.create({
                data: {
                    project_id: parsed.data.project_id,
                    client_user_id: parsed.data.client_user_id,
                    role: parsed.data.role,
                    granted_by: ctx.ownerId,
                },
            });
        }

        revalidatePath(`/dashboard/projects/${parsed.data.project_id}`);
        revalidatePath("/dashboard/projects");
        return { success: true, data: { id: access.id } };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Error al asignar el acceso.",
        };
    }
}

export async function updateProjectAccess(input: {
    id: string;
    role: "viewer" | "manager";
}): Promise<ActionResponse<void>> {
    const parsed = updateProjectAccessSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede editar accesos.",
        };
    }

    const existing = await prisma.project_access.findFirst({
        where: {
            id: input.id,
            projects: {
                clients: { user_id: ctx.ownerId },
            },
        },
    });
    if (!existing) {
        return { success: false, error: "Acceso no encontrado." };
    }

    try {
        await prisma.project_access.update({
            where: { id: input.id },
            data: { role: input.role },
        });
        revalidatePath(`/dashboard/projects/${existing.project_id}`);
        return { success: true, data: undefined };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error ? error.message : "Error al actualizar.",
        };
    }
}

export async function revokeProjectAccess(id: string): Promise<ActionResponse<void>> {
    const parsed = revokeProjectAccessSchema.safeParse({ id });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede revocar accesos.",
        };
    }

    const existing = await prisma.project_access.findFirst({
        where: {
            id,
            projects: {
                clients: { user_id: ctx.ownerId },
            },
        },
    });
    if (!existing) {
        return { success: false, error: "Acceso no encontrado." };
    }

    try {
        await prisma.project_access.update({
            where: { id },
            data: { revoked_at: new Date() },
        });
        revalidatePath(`/dashboard/projects/${existing.project_id}`);
        return { success: true, data: undefined };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al revocar.",
        };
    }
}

/**
 * Toggle del flag `sees_all_projects` en un client_user.
 * - `true`: stakeholder ve TODOS los proyectos del cliente (rol contable/transversal).
 * - `false`: stakeholder solo ve los proyectos asignados vía project_access.
 */
export async function updateClientUserVisibility(input: {
    id: string;
    sees_all_projects: boolean;
}): Promise<ActionResponse<void>> {
    const parsed = updateClientUserVisibilitySchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede cambiar la visibilidad.",
        };
    }

    const existing = await prisma.client_users.findFirst({
        where: {
            id: input.id,
            clients: { user_id: ctx.ownerId },
        },
        select: { id: true, client_id: true },
    });
    if (!existing) {
        return { success: false, error: "Stakeholder no encontrado." };
    }

    try {
        await prisma.client_users.update({
            where: { id: input.id },
            data: { sees_all_projects: input.sees_all_projects },
        });
        revalidatePath(`/dashboard/clients/${existing.client_id}`);
        return { success: true, data: undefined };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Error al actualizar la visibilidad.",
        };
    }
}

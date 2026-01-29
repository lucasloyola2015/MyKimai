"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import type { BillingType, ProjectStatus, projects } from "@prisma/client";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Obtiene todos los proyectos del usuario
 */
export async function getProjects(clientId?: string) {
    const user = await getAuthUser();

    const projects = await prisma.projects.findMany({
        where: {
            client: {
                user_id: user.id,
            },
            ...(clientId && { client_id: clientId }),
        },
        include: {
            client: true,
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return projects;
}

/**
 * Obtiene un proyecto con todas sus relaciones
 */
export async function getProjectWithRelations(id: string) {
    const user = await getAuthUser();

    const project = await prisma.projects.findFirst({
        where: {
            id,
            client: {
                user_id: user.id,
            },
        },
        include: {
            client: true,
            tasks: true,
        },
    });

    return project;
}

/**
 * Crea un nuevo proyecto
 */
export async function createProject(data: {
    client_id: string;
    name: string;
    description?: string | null;
    currency?: string;
    rate?: number | null;
    billing_type?: BillingType;
    status?: ProjectStatus;
    start_date?: Date | null;
    end_date?: Date | null;
}): Promise<ActionResponse<projects>> {
    const user = await getAuthUser();

    // Verificar que el cliente pertenece al usuario
    const client = await prisma.clients.findFirst({
        where: {
            id: data.client_id,
            user_id: user.id,
        },
    });

    if (!client) {
        return {
            success: false,
            error: "Cliente no encontrado.",
        };
    }

    try {
        const project = await prisma.projects.create({
            data: {
                ...data,
                currency: data.currency || client.currency,
                billing_type: data.billing_type || "hourly",
                status: data.status || "active",
            },
            include: {
                client: true,
            },
        });

        revalidatePath("/dashboard/projects");

        return {
            success: true,
            data: project,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al crear el proyecto",
        };
    }
}

/**
 * Actualiza un proyecto existente
 */
export async function updateProject(
    id: string,
    data: {
        name?: string;
        description?: string | null;
        currency?: string;
        rate?: number | null;
        billing_type?: BillingType;
        status?: ProjectStatus;
        start_date?: Date | null;
        end_date?: Date | null;
    }
): Promise<ActionResponse<projects>> {
    const user = await getAuthUser();

    // Verificar que el proyecto pertenece al usuario
    const existing = await prisma.projects.findFirst({
        where: {
            id,
            client: {
                user_id: user.id,
            },
        },
    });

    if (!existing) {
        return {
            success: false,
            error: "Proyecto no encontrado.",
        };
    }

    try {
        const project = await prisma.projects.update({
            where: { id },
            data,
            include: {
                client: true,
            },
        });

        revalidatePath("/dashboard/projects");

        return {
            success: true,
            data: project,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al actualizar el proyecto",
        };
    }
}

/**
 * Elimina un proyecto
 */
export async function deleteProject(id: string) {
    const user = await getAuthUser();

    // Verificar que el proyecto pertenece al usuario
    const existing = await prisma.projects.findFirst({
        where: {
            id,
            client: {
                user_id: user.id,
            },
        },
    });

    if (!existing) {
        return {
            success: false,
            error: "Proyecto no encontrado.",
        };
    }

    await prisma.projects.delete({
        where: { id },
    });

    revalidatePath("/dashboard/projects");

    return {
        success: true,
    };
}

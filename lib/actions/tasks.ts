"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import type { tasks } from "@prisma/client";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Obtiene todas las tareas del usuario
 */
export async function getTasks(projectId?: string) {
    const user = await getAuthUser();

    const tasks = await prisma.tasks.findMany({
        where: {
            projects: {
                clients: {
                    user_id: user.id,
                },
            },
            ...(projectId && { project_id: projectId }),
        },
        include: {
            projects: {
                include: {
                    clients: true,
                },
            },
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return tasks;
}

/**
 * Obtiene una tarea con todas sus relaciones
 */
export async function getTaskWithRelations(id: string) {
    const user = await getAuthUser();

    const task = await prisma.tasks.findFirst({
        where: {
            id,
            projects: {
                clients: {
                    user_id: user.id,
                },
            },
        },
        include: {
            projects: {
                include: {
                    clients: true,
                },
            },
        },
    });

    return task;
}

/**
 * Crea una nueva tarea
 */
export async function createTask(data: {
    project_id: string;
    name: string;
    rate?: number | null;
    is_billable?: boolean;
}): Promise<ActionResponse<tasks>> {
    const user = await getAuthUser();

    // Verificar que el proyecto pertenece al usuario
    const project = await prisma.projects.findFirst({
        where: {
            id: data.project_id,
            clients: {
                user_id: user.id,
            },
        },
    });

    if (!project) {
        return {
            success: false,
            error: "Proyecto no encontrado.",
        };
    }

    try {
        // HERENCIA: Validar contra proyecto y cliente
        const project = await prisma.projects.findUnique({
            where: { id: data.project_id },
            include: { clients: true }
        });

        if (project && ((project as any).is_billable === false || (project.clients as any).is_billable === false)) {
            data.is_billable = false;
        }

        const task = await prisma.tasks.create({
            data,
            include: {
                projects: {
                    include: {
                        clients: true,
                    },
                },
            },
        });

        revalidatePath("/dashboard/tasks");

        return {
            success: true,
            data: task,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al crear la tarea",
        };
    }
}

/**
 * Actualiza una tarea existente
 */
export async function updateTask(
    id: string,
    data: {
        name?: string;
        description?: string | null;
        rate?: number | null;
        is_billable?: boolean;
    }
): Promise<ActionResponse<tasks>> {
    const user = await getAuthUser();

    // Verificar que la tarea pertenece al usuario
    const existing = await prisma.tasks.findFirst({
        where: {
            id,
            projects: {
                clients: {
                    user_id: user.id,
                },
            },
        },
    });

    if (!existing) {
        return {
            success: false,
            error: "Tarea no encontrada.",
        };
    }

    try {
        // HERENCIA: Validar contra proyecto y cliente al intentar activar facturabilidad
        if (data.is_billable === true) {
            const project = await prisma.projects.findUnique({
                where: { id: existing.project_id },
                include: { clients: true }
            });
            if (project && ((project as any).is_billable === false || (project.clients as any).is_billable === false)) {
                return {
                    success: false,
                    error: "No se puede marcar como facturable: El proyecto o cliente no es facturable."
                };
            }
        }

        const task = await prisma.tasks.update({
            where: { id },
            data,
            include: {
                projects: {
                    include: {
                        clients: true,
                    },
                },
            },
        });

        revalidatePath("/dashboard/tasks");

        return {
            success: true,
            data: task,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al actualizar la tarea",
        };
    }
}

/**
 * Elimina una tarea
 */
export async function deleteTask(id: string) {
    const user = await getAuthUser();

    // Verificar que la tarea pertenece al usuario
    const existing = await prisma.tasks.findFirst({
        where: {
            id,
            projects: {
                clients: {
                    user_id: user.id,
                },
            },
        },
    });

    if (!existing) {
        return {
            success: false,
            error: "Tarea no encontrada.",
        };
    }

    await prisma.tasks.delete({
        where: { id },
    });

    revalidatePath("/dashboard/tasks");

    return {
        success: true,
    };
}

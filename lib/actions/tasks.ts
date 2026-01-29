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
            project: {
                client: {
                    user_id: user.id,
                },
            },
            ...(projectId && { project_id: projectId }),
        },
        include: {
            project: {
                include: {
                    client: true,
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
            project: {
                client: {
                    user_id: user.id,
                },
            },
        },
        include: {
            project: {
                include: {
                    client: true,
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
    description?: string | null;
    rate?: number | null;
}): Promise<ActionResponse<tasks>> {
    const user = await getAuthUser();

    // Verificar que el proyecto pertenece al usuario
    const project = await prisma.projects.findFirst({
        where: {
            id: data.project_id,
            client: {
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
        const task = await prisma.tasks.create({
            data,
            include: {
                project: {
                    include: {
                        client: true,
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
    }
): Promise<ActionResponse<tasks>> {
    const user = await getAuthUser();

    // Verificar que la tarea pertenece al usuario
    const existing = await prisma.tasks.findFirst({
        where: {
            id,
            project: {
                client: {
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
        const task = await prisma.tasks.update({
            where: { id },
            data,
            include: {
                project: {
                    include: {
                        client: true,
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
            project: {
                client: {
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

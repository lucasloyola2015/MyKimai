"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { differenceInMinutes } from "date-fns";
import type { time_entries } from "@/lib/generated/prisma";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Obtiene el time entry activo del usuario (si existe)
 */
export async function getActiveTimeEntry() {
    const user = await getAuthUser();

    const activeEntry = await prisma.time_entries.findFirst({
        where: {
            user_id: user.id,
            end_time: null,
        },
        include: {
            task: {
                include: {
                    project: {
                        include: {
                            client: true,
                        },
                    },
                },
            },
        },
    });

    return activeEntry;
}

/**
 * Obtiene las últimas time entries del usuario
 */
export async function getRecentTimeEntries(limit: number = 10) {
    const user = await getAuthUser();

    const entries = await prisma.time_entries.findMany({
        where: {
            user_id: user.id,
        },
        include: {
            task: {
                include: {
                    project: {
                        include: {
                            client: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            start_time: "desc",
        },
        take: limit,
    });

    return entries;
}

/**
 * Calcula la tarifa aplicable para una tarea
 * Cascada: task.rate → project.rate → client.default_rate → 0
 */
async function calculateRate(taskId: string): Promise<number> {
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            project: {
                include: {
                    client: true,
                },
            },
        },
    });

    if (!task) return 0;

    // Cascada de tarifas
    if (task.rate) return Number(task.rate);
    if (task.project.rate) return Number(task.project.rate);
    if (task.project.client.default_rate) return Number(task.project.client.default_rate);

    return 0;
}

/**
 * Inicia un nuevo time entry
 */
export async function startTimeEntry(
    taskId: string,
    description?: string
): Promise<ActionResponse<time_entries>> {
    const user = await getAuthUser();

    // Verificar que no haya un timer activo
    const existingActive = await prisma.time_entries.findFirst({
        where: {
            user_id: user.id,
            end_time: null,
        },
    });

    if (existingActive) {
        return {
            success: false,
            error: "Ya tienes un timer activo. Deténlo antes de iniciar uno nuevo.",
        };
    }

    // Verificar que la tarea existe
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
    });

    if (!task) {
        return {
            success: false,
            error: "Tarea no encontrada.",
        };
    }

    // Calcular tarifa aplicable
    const rate = await calculateRate(taskId);

    try {
        // Crear time entry
        const entry = await prisma.time_entries.create({
            data: {
                user_id: user.id,
                task_id: taskId,
                description: description || null,
                start_time: new Date(),
                end_time: null,
                duration_minutes: null,
                billable: true,
                rate_applied: rate,
                amount: null,
            },
            include: {
                task: {
                    include: {
                        project: {
                            include: {
                                client: true,
                            },
                        },
                    },
                },
            },
        });

        revalidatePath("/dashboard/time-tracker");
        revalidatePath("/dashboard");

        return {
            success: true,
            data: entry,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al iniciar el timer",
        };
    }
}

/**
 * Detiene un time entry activo
 */
export async function stopTimeEntry(
    entryId: string
): Promise<ActionResponse<time_entries>> {
    const user = await getAuthUser();

    // Obtener el entry
    const entry = await prisma.time_entries.findUnique({
        where: { id: entryId },
    });

    if (!entry) {
        return {
            success: false,
            error: "Time entry no encontrado.",
        };
    }

    if (entry.user_id !== user.id) {
        return {
            success: false,
            error: "No autorizado.",
        };
    }

    if (entry.end_time) {
        return {
            success: false,
            error: "Este timer ya está detenido.",
        };
    }

    // Calcular duración y monto
    const endTime = new Date();
    const durationMinutes = differenceInMinutes(endTime, entry.start_time);
    const rate = Number(entry.rate_applied || 0);
    const amount = (durationMinutes / 60) * rate;

    try {
        // Actualizar entry
        const updatedEntry = await prisma.time_entries.update({
            where: { id: entryId },
            data: {
                end_time: endTime,
                duration_minutes: durationMinutes,
                amount: amount,
            },
            include: {
                task: {
                    include: {
                        project: {
                            include: {
                                client: true,
                            },
                        },
                    },
                },
            },
        });

        revalidatePath("/dashboard/time-tracker");
        revalidatePath("/dashboard");
        revalidatePath("/dashboard/my-hours");

        return {
            success: true,
            data: updatedEntry,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al detener el timer",
        };
    }
}

/**
 * Elimina un time entry
 */
export async function deleteTimeEntry(entryId: string) {
    const user = await getAuthUser();

    // Verificar que el entry pertenece al usuario
    const entry = await prisma.time_entries.findUnique({
        where: { id: entryId },
    });

    if (!entry) {
        return {
            success: false,
            error: "Time entry no encontrado.",
        };
    }

    if (entry.user_id !== user.id) {
        return {
            success: false,
            error: "No autorizado.",
        };
    }

    // Eliminar
    await prisma.time_entries.delete({
        where: { id: entryId },
    });

    revalidatePath("/dashboard/time-tracker");
    revalidatePath("/dashboard/my-hours");

    return {
        success: true,
    };
}

/**
 * Obtiene las tareas disponibles para el time tracker
 */
export async function getAvailableTasks() {
    const user = await getAuthUser();

    const tasks = await prisma.tasks.findMany({
        where: {
            project: {
                client: {
                    user_id: user.id,
                },
                status: "active",
            },
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

"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser, getClientContext } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import type { BillingType, ProjectStatus, projects } from "@prisma/client";
import { computeEntryTotals } from "@/lib/utils";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Obtiene todos los proyectos del usuario
 */
export async function getProjects(clientId?: string) {
    const user = await getAuthUser();
    const clientContext = await getClientContext();

    const where: any = {};
    if (clientContext) {
        where.client_id = clientContext.clientId;
    } else {
        where.client = {
            user_id: user.id,
        };
        if (clientId) where.client_id = clientId;
    }

    const projects = await prisma.projects.findMany({
        where,
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
    const clientContext = await getClientContext();

    const where: any = { id };
    if (clientContext) {
        where.client_id = clientContext.clientId;
    } else {
        where.client = {
            user_id: user.id,
        };
    }

    const project = await prisma.projects.findFirst({
        where,
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

/**
 * Obtiene proyectos para el portal de clientes con resumen de horas y montos
 */
export async function getPortalProjects() {
    const context = await getClientContext();
    if (!context) return [];

    const projects = await prisma.projects.findMany({
        where: {
            client_id: context.clientId,
        },
        include: {
            tasks: {
                include: {
                    time_entries: {
                        include: {
                            breaks: true
                        }
                    }
                }
            }
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return projects.map(project => {
        let totalMinutes = 0;
        let totalAmount = 0;

        project.tasks.forEach(task => {
            task.time_entries.forEach(entry => {
                const totals = computeEntryTotals(entry as any);
                totalMinutes += totals.duration_minutes;
                totalAmount += totals.amount;
            });
        });

        // Eliminar tasks de la respuesta para el cliente para limpiar el payload
        const { tasks, ...projectData } = project;

        return {
            ...projectData,
            total_hours: totalMinutes / 60,
            total_amount: totalAmount,
        };
    });
}

/**
 * Obtiene el detalle de un proyecto específico para el portal de clientes
 */
export async function getPortalProjectDetail(projectId: string) {
    const context = await getClientContext();
    if (!context) throw new Error("Acceso no autorizado");

    const project = await prisma.projects.findUnique({
        where: {
            id: projectId,
            client_id: context.clientId,
        },
        include: {
            tasks: {
                include: {
                    time_entries: {
                        orderBy: {
                            start_time: "desc",
                        },
                        include: {
                            breaks: true
                        }
                    }
                }
            }
        }
    });

    if (!project) return null;

    // Procesar tareas para obtener totales por tarea
    const tasksWithStats = project.tasks.map(task => {
        let taskMinutes = 0;
        let taskAmount = 0;

        task.time_entries.forEach(entry => {
            const totals = computeEntryTotals(entry as any);
            taskMinutes += totals.duration_minutes;
            taskAmount += totals.amount;
        });

        return {
            ...task,
            total_hours: taskMinutes / 60,
            total_amount: taskAmount,
        };
    });

    // Aplanar registros de tiempo para una vista cronológica global del proyecto
    const allTimeEntries = project.tasks.flatMap(task =>
        task.time_entries.map(entry => {
            const totals = computeEntryTotals(entry as any);
            return {
                ...entry,
                ...totals,
                taskName: task.name,
            };
        })
    ).sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

    const { tasks, ...projectData } = project;

    return {
        ...projectData,
        tasks: tasksWithStats,
        timeEntries: allTimeEntries,
    };
}

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
        where.clients = {
            user_id: user.id,
        };
        if (clientId) where.client_id = clientId;
    }

    const projects = await prisma.projects.findMany({
        where,
        include: {
            clients: true,
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
        where.clients = {
            user_id: user.id,
        };
    }

    const project = await prisma.projects.findFirst({
        where,
        include: {
            clients: true,
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
    is_billable?: boolean;
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
        // HERENCIA: Si el cliente no es facturable, el proyecto DEBE ser no facturable
        if (client && (client as any).is_billable === false) {
            data.is_billable = false;
        }

        const project = await prisma.projects.create({
            data: {
                ...data,
                currency: data.currency || client.currency,
                billing_type: data.billing_type || "hourly",
                status: data.status || "active",
            },
            include: {
                clients: true,
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
        is_billable?: boolean;
    }
): Promise<ActionResponse<projects>> {
    const user = await getAuthUser();

    // Verificar que el proyecto pertenece al usuario
    const existing = await prisma.projects.findFirst({
        where: {
            id,
            clients: {
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
        // HERENCIA: Validamos contra el cliente al intentar activar facturabilidad
        if (data.is_billable === true) {
            const client = await prisma.clients.findUnique({
                where: { id: existing.client_id }
            });
            if (client && (client as any).is_billable === false) {
                return {
                    success: false,
                    error: "No se puede marcar como facturable: El cliente principal no es facturable."
                };
            }
        }

        // Si el proyecto pasa a no ser facturable, forzamos sus tareas a cascada
        if (data.is_billable === false) {
            await (prisma.tasks as any).updateMany({
                where: { project_id: id },
                data: { is_billable: false }
            });
        }

        const project = await prisma.projects.update({
            where: { id },
            data,
            include: {
                clients: true,
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
            clients: {
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
                            time_entry_breaks: true
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
        let lastEntryDate: Date | null = null;
        let hasUnbilled = false;

        project.tasks.forEach(task => {
            task.time_entries.forEach(entry => {
                const totals = computeEntryTotals(entry as any);
                totalMinutes += totals.duration_neto;
                const start = new Date(entry.start_time);
                if (!lastEntryDate || start > lastEntryDate) lastEntryDate = start;
                if (!entry.is_billed) hasUnbilled = true;
            });
        });

        // Eliminar tasks de la respuesta para el cliente para limpiar el payload.
        // No exponer total_amount: montos solo en módulo de facturación (portal).
        const { tasks, ...projectData } = project;

        return {
            ...projectData,
            total_hours: totalMinutes / 60,
            last_entry_date: lastEntryDate != null ? (lastEntryDate as Date).toISOString() : null,
            billing_status: hasUnbilled ? "pending" : (totalMinutes > 0 ? "invoiced" : "none"),
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
                            time_entry_breaks: true
                        }
                    }
                }
            }
        }
    });

    if (!project) return null;

    // Procesar tareas: solo horas netas (sin montos; visibilidad monetaria solo en facturación).
    const tasksWithStats = project.tasks.map(task => {
        let taskMinutes = 0;

        task.time_entries.forEach(entry => {
            const totals = computeEntryTotals(entry as any);
            taskMinutes += totals.duration_neto;
        });

        return {
            ...task,
            total_hours: taskMinutes / 60,
        };
    });

    // Aplanar registros: duración neta + breaks para la barra de tiempo (auditoría visual de jornada).
    const allTimeEntries = project.tasks.flatMap(task =>
        task.time_entries.map(entry => {
            const totals = computeEntryTotals(entry as any);
            return {
                id: entry.id,
                start_time: entry.start_time,
                end_time: entry.end_time,
                description: entry.description,
                is_billed: entry.is_billed,
                duration_neto: totals.duration_neto,
                taskName: task.name,
                breaks: entry.time_entry_breaks ?? [],
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

"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser, getClientContext } from "@/lib/auth/server";

/**
 * Obtiene la configuración de branding (logo) del cliente actual
 * Este action está diseñado para ser llamado desde el portal de clientes
 */
export async function getClientBranding(clientId: string) {
    try {
        const client = await prisma.clients.findUnique({
            where: { id: clientId },
            select: {
                name: true,
                logo_url: true,
            } as any
        });

        return client;
    } catch (error) {
        console.error("Error fetching client branding:", error);
        return null;
    }
}

/**
 * Obtiene la distribución de horas por proyecto para un cliente en un rango dado
 */
export async function getClientReportAnalytics(filters: {
    clientId?: string;
    projectId?: string;
    startDate?: Date;
    endDate?: Date;
}) {
    const user = await getAuthUser();
    const clientContext = await getClientContext();

    const where: any = {
        tasks: {
            projects: {}
        }
    };

    // Si es cliente, forzar su clientId. Si es cliente interno, filtrar por sus proyectos.
    if (clientContext) {
        where.tasks.projects.client_id = clientContext.clientId;
    } else {
        where.tasks.projects.clients = {
            user_id: user.id
        };
        if (filters.clientId) {
            where.tasks.projects.client_id = filters.clientId;
        }
    }

    if (filters.projectId) {
        where.tasks.project_id = filters.projectId;
    }

    if (filters.startDate || filters.endDate) {
        where.start_time = {};
        if (filters.startDate) where.start_time.gte = filters.startDate;
        if (filters.endDate) where.start_time.lte = filters.endDate;
    }

    const entries = await prisma.time_entries.findMany({
        where,
        include: {
            tasks: {
                include: {
                    projects: true
                }
            }
        },
        orderBy: {
            start_time: "asc"
        }
    });

    // Agrupar por día para el gráfico
    const dailyData: Record<string, number> = {};
    const projectData: Record<string, number> = {};

    entries.forEach((entry: any) => {
        // Solo incluir entradas facturables en las analíticas de tiempo facturable
        if (entry.billable === false) return;

        const date = entry.start_time.toISOString().split('T')[0];
        const projectName = entry.tasks.projects.name;
        const duration = entry.duration_neto || 0;

        dailyData[date] = (dailyData[date] || 0) + duration;
        projectData[projectName] = (projectData[projectName] || 0) + duration;
    });

    return {
        daily: Object.entries(dailyData).map(([date, minutes]) => ({
            date,
            hours: Number((minutes / 60).toFixed(2))
        })),
        projects: Object.entries(projectData).map(([name, minutes]) => ({
            name,
            hours: Number((minutes / 60).toFixed(2))
        }))
    };
}

/**
 * Actualiza la descripción de una entrada de tiempo (Solo Root)
 */
export async function updateEntryDescription(entryId: string, description: string | null) {
    const user = await getAuthUser();

    // Verificar que el entry pertenece al administrador (dueño del workspace)
    const entry = await prisma.time_entries.findFirst({
        where: {
            id: entryId,
            tasks: {
                projects: {
                    clients: {
                        user_id: user.id
                    }
                }
            }
        }
    });

    if (!entry) {
        return { success: false, error: "No autorizado o registro no encontrado" };
    }

    try {
        await prisma.time_entries.update({
            where: { id: entryId },
            data: {
                description,
                updated_at: new Date() // Forzar actualización de timestamp
            }
        });

        return { success: true };
    } catch (error) {
        console.error("Error updating entry description:", error);
        return { success: false, error: "Error al actualizar la descripción" };
    }
}

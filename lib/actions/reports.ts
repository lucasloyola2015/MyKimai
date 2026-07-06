"use server";

import { prisma } from "@/lib/prisma/client";
import { getClientContext } from "@/lib/auth/server";
import { getOwnerContext, canManageWorkspace, canSeeFinancials } from "@/lib/auth/owner-context";
import { getPortalProjectFilter, taskProjectIdFilter } from "@/lib/auth/portal-context";
import { arDayKey } from "@/lib/timezone";

/**
 * Obtiene la configuración de branding (logo) del cliente actual
 * Este action está diseñado para ser llamado desde el portal de clientes
 */
export async function getClientBranding(clientId: string) {
    try {
        // §SEC — resolver/validar el clientId contra el contexto autenticado.
        // Portal: forzar el cliente de la sesión (ignora el parámetro recibido).
        // Interno: validar que el cliente pertenezca al workspace del owner.
        // Antes confiaba en el clientId del request → IDOR de name+logo_url.
        const clientContext = await getClientContext();
        const where: any = clientContext
            ? { id: clientContext.clientId }
            : { id: clientId, user_id: (await getOwnerContext()).ownerId };

        const client = await prisma.clients.findFirst({
            where,
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
 * §feature — Datos para el informe detallado (resumen por proyecto) de UNA
 * factura: las time_entries linkeadas a esa factura + el cliente. Scopeado al
 * owner (canSeeFinancials). Lo consume el botón de "Descargar informe" del
 * listado de facturas.
 */
export async function getInvoiceReportData(invoiceId: string) {
    const ctx = await getOwnerContext();
    if (!canSeeFinancials(ctx)) return null;

    const invoice = await prisma.invoices.findFirst({
        where: { id: invoiceId, clients: { user_id: ctx.ownerId } },
        select: {
            id: true,
            invoice_number: true,
            clients: { select: { name: true, logo_url: true } },
        },
    });
    if (!invoice) return null;

    const entries = await prisma.time_entries.findMany({
        where: { invoice_id: invoiceId },
        include: {
            tasks: { include: { projects: { include: { clients: true } } } },
        },
        orderBy: { start_time: "asc" },
    });

    return { invoice, entries };
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
    const portalFilter = await getPortalProjectFilter();

    const where: any = {
        tasks: {
            projects: {}
        }
    };

    // Si es cliente del portal, forzar su clientId y respetar project_access
    // (§F4). Si es team/owner, filtrar por el workspace efectivo (ownerId).
    if (portalFilter) {
        where.tasks.projects.client_id = portalFilter.clientId;
        const pf = taskProjectIdFilter(portalFilter); // { project_id?: { in } }
        if (pf.project_id) where.tasks.project_id = pf.project_id;
        // filters.projectId solo si pertenece a los proyectos permitidos.
        if (
            filters.projectId &&
            (portalFilter.kind === "all" ||
                portalFilter.projectIds.includes(filters.projectId))
        ) {
            where.tasks.project_id = filters.projectId;
        }
    } else {
        const ctx = await getOwnerContext();
        where.tasks.projects.clients = {
            user_id: ctx.ownerId
        };
        if (filters.clientId) {
            where.tasks.projects.client_id = filters.clientId;
        }
        if (filters.projectId) {
            where.tasks.project_id = filters.projectId;
        }
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

        // §TZ — agrupar por día en hora de Argentina, no UTC (el trabajo nocturno
        // caía en el día siguiente en el reporte que audita el cliente).
        const date = arDayKey(entry.start_time);
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
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede editar descripciones de registros.",
        };
    }

    // Verificar que el entry pertenece al workspace
    const entry = await prisma.time_entries.findFirst({
        where: {
            id: entryId,
            tasks: {
                projects: {
                    clients: {
                        user_id: ctx.ownerId
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

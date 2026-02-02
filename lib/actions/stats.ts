"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser, getClientContext } from "@/lib/auth/server";
import { startOfDay, endOfDay } from "date-fns";

/**
 * Obtiene estadísticas para el sidebar/navegación
 * Migrado de Supabase a Prisma
 */
export async function getNavStats() {
    try {
        const user = await getAuthUser();
        const clientContext = await getClientContext();
        const role: "ADMIN" | "CLIENT" = clientContext ? "CLIENT" : "ADMIN";

        // Si es cliente, las stats son diferentes o nulas para el dashboard principal
        if (clientContext) {
            return {
                activeProjects: 0,
                pendingInvoices: 0,
                activeTimeEntry: false,
                todayHours: 0,
                role: "CLIENT" as const,
            };
        }

        // Queries en paralelo para mejor performance
        // Usando $queryRaw temporalmente para evitar problemas con ENUMs hasta que las columnas se alteren
        const [activeProjectsCountResult, pendingInvoicesCountResult, activeEntry, todayEntries] =
            await Promise.all([
                // Proyectos activos del usuario - usando queryRaw para evitar problema con ENUMs
                prisma.$queryRaw<Array<{ count: bigint }>>`
                    SELECT COUNT(*)::int as count
                    FROM projects p
                    INNER JOIN clients c ON p.client_id = c.id
                    WHERE c.user_id = ${user.id}::uuid
                    AND p.status::text = 'active'
                `,

                // Facturas pendientes (draft + sent) - usando queryRaw para evitar problema con ENUMs
                prisma.$queryRaw<Array<{ count: bigint }>>`
                SELECT COUNT(*)::int as count
                FROM invoices i
                INNER JOIN clients c ON i.client_id = c.id
                WHERE c.user_id = ${user.id}::uuid
                AND i.status::text IN ('draft', 'sent')
            `,

                // Timer activo (time entry sin end_time)
                prisma.time_entries.findFirst({
                    where: {
                        user_id: user.id,
                        end_time: null,
                    },
                    select: {
                        id: true,
                    },
                }),

                // Horas trabajadas hoy
                prisma.time_entries.findMany({
                    where: {
                        user_id: user.id,
                        start_time: {
                            gte: startOfDay(new Date()),
                            lte: endOfDay(new Date()),
                        },
                    },
                    select: {
                        duration_minutes: true,
                    },
                }),
            ]);

        // Extraer counts de los resultados de queryRaw
        const activeProjectsCount = Number(activeProjectsCountResult[0]?.count || 0);
        const pendingInvoicesCount = Number(pendingInvoicesCountResult[0]?.count || 0);

        // Calcular total de minutos trabajados hoy
        const todayMinutes = todayEntries.reduce(
            (sum, entry) => sum + (entry.duration_minutes || 0),
            0
        );

        return {
            activeProjects: activeProjectsCount,
            pendingInvoices: pendingInvoicesCount,
            activeTimeEntry: !!activeEntry,
            todayHours: todayMinutes,
            role: "ADMIN" as const,
        };
    } catch (error) {
        console.error("Error in getNavStats:", error);
        // Retornar valores por defecto en caso de error
        return {
            activeProjects: 0,
            pendingInvoices: 0,
            activeTimeEntry: false,
            todayHours: 0,
            role: "ADMIN" as const,
        };
    }
}

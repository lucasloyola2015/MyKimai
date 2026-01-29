"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { startOfDay, endOfDay } from "date-fns";

/**
 * Helper para agregar timeout a una promesa
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
        ),
    ]);
}

/**
 * Obtiene estadísticas para el sidebar/navegación
 * Migrado de Supabase a Prisma
 * Con timeout de 5 segundos para evitar bloqueos
 */
export async function getNavStats() {
    try {
        // Timeout de 5 segundos para evitar que se cuelgue indefinidamente
        const statsPromise = (async () => {
            const user = await getAuthUser();

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
            };
        })();

        // Aplicar timeout de 5 segundos
        return await withTimeout(statsPromise, 5000);
    } catch (error) {
        console.error("Error in getNavStats:", error);
        // Retornar valores por defecto en caso de error o timeout
        return {
            activeProjects: 0,
            pendingInvoices: 0,
            activeTimeEntry: false,
            todayHours: 0,
        };
    }
}

"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser, getClientContext } from "@/lib/auth/server";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";

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
                        duration_neto: true,
                    },
                }),
            ]);

        // Extraer counts de los resultados de queryRaw
        const activeProjectsCount = Number(activeProjectsCountResult[0]?.count || 0);
        const pendingInvoicesCount = Number(pendingInvoicesCountResult[0]?.count || 0);

        // Calcular total de minutos trabajados hoy
        const todayMinutes = todayEntries.reduce(
            (sum, entry) => sum + (entry.duration_neto || 0),
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

/**
 * Estadísticas del Dashboard principal del usuario.
 *
 * Resuelve los bugs §3.1 y §3.2 del IMPROVEMENT_PLAN:
 * - §3.1: filtra siempre por user_id (directo o vía clients.user_id) para no
 *   exponer datos de otros usuarios si la RLS tuviera un hueco.
 * - §3.2: agrupa los ingresos por moneda, en lugar de sumar USD+ARS como un
 *   único total incorrecto.
 *
 * Además, §4.1: este reemplaza el código `"use client"` con queries directos
 * de supabase-js en `app/dashboard/page.tsx`, alineándolo con el patrón
 * Server Actions + Prisma del resto del proyecto.
 */
export interface DashboardRevenueByCurrency {
    currency: string;
    total: number;
    count: number;
}

export interface DashboardStats {
    hoursTodayMinutes: number;
    hoursThisWeekMinutes: number;
    activeProjects: number;
    totalClients: number;
    pendingInvoices: number;
    revenueByCurrency: DashboardRevenueByCurrency[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
    const user = await getAuthUser();

    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    const weekStart = startOfWeek(today);
    const weekEnd = endOfWeek(today);

    // Queries en paralelo - todas filtran explícitamente por user_id o clients.user_id
    const [
        todayEntries,
        weekEntries,
        activeProjectsCountResult,
        clientsCount,
        pendingInvoicesCountResult,
        paidInvoices,
    ] = await Promise.all([
        // Horas hoy
        prisma.time_entries.findMany({
            where: {
                user_id: user.id,
                start_time: { gte: todayStart, lte: todayEnd },
            },
            select: { duration_neto: true },
        }),
        // Horas esta semana
        prisma.time_entries.findMany({
            where: {
                user_id: user.id,
                start_time: { gte: weekStart, lte: weekEnd },
            },
            select: { duration_neto: true },
        }),
        // Proyectos activos del usuario - queryRaw para evitar conflicto de ENUMs
        prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::int as count
            FROM projects p
            INNER JOIN clients c ON p.client_id = c.id
            WHERE c.user_id = ${user.id}::uuid
              AND p.status::text = 'active'
        `,
        // Total de clientes
        prisma.clients.count({ where: { user_id: user.id } }),
        // Facturas pendientes (draft + sent)
        prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::int as count
            FROM invoices i
            INNER JOIN clients c ON i.client_id = c.id
            WHERE c.user_id = ${user.id}::uuid
              AND i.status::text IN ('draft', 'sent')
        `,
        // Ingresos pagados - SOLO del usuario logueado (fix §3.1)
        // y con currency para agrupar (fix §3.2)
        prisma.invoices.findMany({
            where: {
                status: "paid",
                clients: { user_id: user.id },
            },
            select: { total_amount: true, currency: true },
        }),
    ]);

    const hoursTodayMinutes = todayEntries.reduce(
        (sum, e) => sum + (e.duration_neto || 0),
        0
    );
    const hoursThisWeekMinutes = weekEntries.reduce(
        (sum, e) => sum + (e.duration_neto || 0),
        0
    );

    // Agrupar ingresos por moneda (fix §3.2)
    const revenueMap = new Map<string, { total: number; count: number }>();
    for (const inv of paidInvoices) {
        const currency = inv.currency || "USD";
        const amount = Number(inv.total_amount) || 0;
        const entry = revenueMap.get(currency) ?? { total: 0, count: 0 };
        entry.total += amount;
        entry.count += 1;
        revenueMap.set(currency, entry);
    }

    const revenueByCurrency: DashboardRevenueByCurrency[] = Array.from(
        revenueMap.entries()
    )
        .map(([currency, { total, count }]) => ({
            currency,
            total: Math.round(total * 100) / 100,
            count,
        }))
        // Orden estable: USD primero, después ARS, después resto alfabético
        .sort((a, b) => {
            const order = (c: string) => (c === "USD" ? 0 : c === "ARS" ? 1 : 2);
            return order(a.currency) - order(b.currency) || a.currency.localeCompare(b.currency);
        });

    return {
        hoursTodayMinutes,
        hoursThisWeekMinutes,
        activeProjects: Number(activeProjectsCountResult[0]?.count || 0),
        totalClients: clientsCount,
        pendingInvoices: Number(pendingInvoicesCountResult[0]?.count || 0),
        revenueByCurrency,
    };
}

"use server";

import { prisma } from "@/lib/prisma/client";
import { getClientContext } from "@/lib/auth/server";
import {
    getOwnerContext,
    canSeeFinancials,
} from "@/lib/auth/owner-context";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";

/**
 * Estadísticas para el sidebar/navegación.
 *
 * Para un usuario interno (owner o team_member):
 * - `activeProjects`, `pendingInvoices`: workspace-wide (filtra por ownerId).
 * - `activeTimeEntry`, `todayHours`: del actor (mi timer / mis horas).
 *
 * §F2.D — collaborator no ve `pendingInvoices` (queda en 0).
 */
export async function getNavStats() {
    try {
        const clientContext = await getClientContext();

        // Cliente del portal: las stats del dashboard interno no aplican
        if (clientContext) {
            return {
                activeProjects: 0,
                pendingInvoices: 0,
                activeTimeEntry: false,
                todayHours: 0,
                role: "CLIENT" as const,
            };
        }

        const ctx = await getOwnerContext();
        const showInvoices = canSeeFinancials(ctx);

        const [activeProjectsCountResult, pendingInvoicesCountResult, activeEntry, todayEntries] =
            await Promise.all([
                // Proyectos activos del workspace
                prisma.$queryRaw<Array<{ count: bigint }>>`
                    SELECT COUNT(*)::int as count
                    FROM projects p
                    INNER JOIN clients c ON p.client_id = c.id
                    WHERE c.user_id = ${ctx.ownerId}::uuid
                    AND p.status::text = 'active'
                `,

                // Facturas pendientes (solo si tiene permiso financiero)
                showInvoices
                    ? prisma.$queryRaw<Array<{ count: bigint }>>`
                        SELECT COUNT(*)::int as count
                        FROM invoices i
                        INNER JOIN clients c ON i.client_id = c.id
                        WHERE c.user_id = ${ctx.ownerId}::uuid
                        AND i.status::text IN ('draft', 'sent')
                    `
                    : Promise.resolve([{ count: BigInt(0) }] as Array<{ count: bigint }>),

                // Timer activo (del actor)
                prisma.time_entries.findFirst({
                    where: {
                        user_id: ctx.actorId,
                        end_time: null,
                    },
                    select: { id: true },
                }),

                // Horas trabajadas hoy (del actor)
                prisma.time_entries.findMany({
                    where: {
                        user_id: ctx.actorId,
                        start_time: {
                            gte: startOfDay(new Date()),
                            lte: endOfDay(new Date()),
                        },
                    },
                    select: { duration_neto: true },
                }),
            ]);

        const activeProjectsCount = Number(activeProjectsCountResult[0]?.count || 0);
        const pendingInvoicesCount = Number(pendingInvoicesCountResult[0]?.count || 0);

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
 * Estadísticas del Dashboard principal.
 *
 * Bugs resueltos:
 * - §3.1 — filtra siempre por workspace (ownerId vía clients.user_id).
 * - §3.2 — ingresos agrupados por moneda.
 * - §4.1 — Server Action en lugar de supabase-js cliente.
 *
 * §F2.D — un collaborator ve `revenueByCurrency = []` y `pendingInvoices = 0`.
 * Horas (today / week) son del actor.
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
    const ctx = await getOwnerContext();
    const showFinancials = canSeeFinancials(ctx);

    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    // §REPORTES — semana de Lunes a Domingo, consistente con el chart del
    // dashboard (weekStartsOn:1) y el portal. Antes usaba el default domingo.
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

    const [
        todayEntries,
        weekEntries,
        activeProjectsCountResult,
        clientsCount,
        pendingInvoicesCountResult,
        paidInvoices,
    ] = await Promise.all([
        // Horas hoy del actor
        prisma.time_entries.findMany({
            where: {
                user_id: ctx.actorId,
                start_time: { gte: todayStart, lte: todayEnd },
            },
            select: { duration_neto: true },
        }),
        // Horas esta semana del actor
        prisma.time_entries.findMany({
            where: {
                user_id: ctx.actorId,
                start_time: { gte: weekStart, lte: weekEnd },
            },
            select: { duration_neto: true },
        }),
        // Proyectos activos del workspace
        prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::int as count
            FROM projects p
            INNER JOIN clients c ON p.client_id = c.id
            WHERE c.user_id = ${ctx.ownerId}::uuid
              AND p.status::text = 'active'
        `,
        // Total de clientes del workspace
        prisma.clients.count({ where: { user_id: ctx.ownerId } }),
        // Facturas pendientes (solo si tiene permiso financiero)
        showFinancials
            ? prisma.$queryRaw<Array<{ count: bigint }>>`
                SELECT COUNT(*)::int as count
                FROM invoices i
                INNER JOIN clients c ON i.client_id = c.id
                WHERE c.user_id = ${ctx.ownerId}::uuid
                  AND i.status::text IN ('draft', 'sent')
            `
            : Promise.resolve([{ count: BigInt(0) }] as Array<{ count: bigint }>),
        // Ingresos pagados del workspace (solo si tiene permiso financiero)
        showFinancials
            ? prisma.invoices.findMany({
                  where: {
                      status: "paid",
                      clients: { user_id: ctx.ownerId },
                  },
                  select: { total_amount: true, currency: true },
              })
            : Promise.resolve([] as Array<{ total_amount: any; currency: string }>),
    ]);

    const hoursTodayMinutes = todayEntries.reduce(
        (sum, e) => sum + (e.duration_neto || 0),
        0
    );
    const hoursThisWeekMinutes = weekEntries.reduce(
        (sum, e) => sum + (e.duration_neto || 0),
        0
    );

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

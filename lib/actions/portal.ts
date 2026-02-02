"use server";

import { prisma } from "@/lib/prisma/client";
import { getClientContext } from "@/lib/auth/server";
import { startOfMonth, subMonths } from "date-fns";
import { getUsdExchangeRate } from "./exchange";
import { computeEntryTotals } from "@/lib/utils";

/**
 * Obtiene los datos resumidos para el dashboard del portal de clientes
 */
export async function getPortalDashboardData() {
    const context = await getClientContext();
    if (!context) throw new Error("Acceso no autorizado al portal");

    const now = new Date();
    const firstDayOfMonth = startOfMonth(now);
    const firstDayPrevMonth = startOfMonth(subMonths(now, 1));

    // 1. Obtener todas las facturas impagas y calcular total
    const unpaidInvoices = await prisma.invoices.findMany({
        where: {
            client_id: context.clientId,
            status: { not: "paid" }
        },
        select: { total_amount: true }
    });

    const unpaidCount = unpaidInvoices.length;
    const unpaidTotal = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);

    // 2. Calcular horas del mes actual
    const currentEntries = await prisma.time_entries.findMany({
        where: {
            task: {
                project: {
                    client_id: context.clientId,
                }
            },
            start_time: { gte: firstDayOfMonth }
        },
        include: {
            breaks: true
        }
    });

    // 3. Calcular horas del mes pasado
    const prevEntries = await prisma.time_entries.findMany({
        where: {
            task: {
                project: {
                    client_id: context.clientId,
                }
            },
            start_time: {
                gte: firstDayPrevMonth,
                lt: firstDayOfMonth
            }
        },
        include: {
            breaks: true
        }
    });

    const hoursCurrent = (currentEntries.reduce((sum, e) => {
        const totals = computeEntryTotals(e as any);
        return sum + totals.duration_minutes;
    }, 0)) / 60;

    const hoursPrev = (prevEntries.reduce((sum, e) => {
        const totals = computeEntryTotals(e as any);
        return sum + totals.duration_minutes;
    }, 0)) / 60;

    // 4. Tipo de cambio actual
    const exchangeRate = await getUsdExchangeRate();

    // 5. Datos del cliente
    const client = await prisma.clients.findUnique({
        where: { id: context.clientId },
        select: { currency: true, name: true }
    });

    return {
        hoursCurrentMonth: hoursCurrent,
        hoursPreviousMonth: hoursPrev,
        unpaidInvoices: unpaidCount,
        totalUnpaidAmount: unpaidTotal,
        exchangeRate,
        currency: client?.currency || "USD",
        clientName: client?.name || context.name,
    };
}

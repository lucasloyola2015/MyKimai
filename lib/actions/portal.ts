"use server";

import { prisma } from "@/lib/prisma/client";
import { getClientContext } from "@/lib/auth/server";
import {
    startOfMonth,
    subMonths,
    startOfWeek,
    endOfWeek,
    startOfDay,
    endOfDay,
    endOfMonth,
    subWeeks,
    subDays,
    format,
    eachDayOfInterval,
    eachWeekOfInterval,
    eachMonthOfInterval,
} from "date-fns";
import { es } from "date-fns/locale";
import { getUsdExchangeRate } from "./exchange";
import { computeEntryTotals, computeMinutesPerHour } from "@/lib/utils";

const WEEK_STARTS_ON = 1; // Lunes

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
        return sum + totals.duration_neto;
    }, 0)) / 60;

    const hoursPrev = (prevEntries.reduce((sum, e) => {
        const totals = computeEntryTotals(e as any);
        return sum + totals.duration_neto;
    }, 0)) / 60;

    // 4. Tipo de cambio actual
    const exchangeRate = await getUsdExchangeRate();

    // 5. Datos del cliente
    const client = await prisma.clients.findUnique({
        where: { id: context.clientId },
        select: { currency: true, name: true }
    });

    // 6. Proyectos activos del cliente
    const activeProjectsCount = await prisma.projects.count({
        where: {
            client_id: context.clientId,
            status: "active",
        },
    });

    // 7. Última factura emitida (para stat "Última factura ARS/USD")
    const lastInvoice = await prisma.invoices.findFirst({
        where: { client_id: context.clientId },
        orderBy: { issue_date: "desc" },
        select: { total_amount: true, currency: true },
    });

    return {
        hoursCurrentMonth: hoursCurrent,
        hoursPreviousMonth: hoursPrev,
        unpaidInvoices: unpaidCount,
        totalUnpaidAmount: unpaidTotal,
        exchangeRate,
        currency: client?.currency || "USD",
        clientName: client?.name || context.name,
        activeProjectsCount,
        lastInvoice: lastInvoice
            ? { total_amount: Number(lastInvoice.total_amount), currency: lastInvoice.currency ?? "USD" }
            : null,
    };
}

/**
 * Horas no facturadas por proyecto para el portal de clientes.
 * Única zona donde el cliente puede ver el valor acumulado (USD/ARS) por proyecto pendiente de facturar.
 */
export async function getPortalUnbilledSummary(): Promise<
    { projectId: string; projectName: string; totalHours: number; totalAmount: number; currency: string }[]
> {
    const context = await getClientContext();
    if (!context) return [];

    const entries = await prisma.time_entries.findMany({
        where: {
            is_billed: false,
            billable: true,
            task: {
                project: {
                    client_id: context.clientId,
                },
            },
        },
        include: {
            breaks: true,
            task: {
                include: {
                    project: { select: { id: true, name: true, currency: true } },
                },
            },
        },
    });

    const byProject = new Map<
        string,
        { projectName: string; currency: string; totalMinutes: number; totalAmount: number }
    >();

    for (const entry of entries) {
        const totals = computeEntryTotals(entry as any);
        const pid = entry.task.project.id;
        const cur = entry.task.project.currency || "USD";
        const existing = byProject.get(pid);
        if (existing) {
            existing.totalMinutes += totals.duration_neto;
            existing.totalAmount += totals.amount;
        } else {
            byProject.set(pid, {
                projectName: entry.task.project.name,
                currency: cur,
                totalMinutes: totals.duration_neto,
                totalAmount: totals.amount,
            });
        }
    }

    return Array.from(byProject.entries()).map(([projectId, data]) => ({
        projectId,
        projectName: data.projectName,
        totalHours: data.totalMinutes / 60,
        totalAmount: data.totalAmount,
        currency: data.currency,
    }));
}

export type PortalChartPeriod = "day" | "week" | "month";

export interface PortalChartDataPoint {
    period: string;
    total: number;
    [projectKey: string]: number | string;
}

/**
 * Datos para la gráfica de horas del portal: solo entradas del clientId de la sesión.
 * Agrupado por período (día/semana/mes) y por proyecto.
 */
export async function getPortalChartData(
    period: PortalChartPeriod,
    periodOffset: number
): Promise<{ data: PortalChartDataPoint[]; dateRange: { start: string; end: string } }> {
    const context = await getClientContext();
    if (!context) return { data: [], dateRange: { start: "", end: "" } };

    const now = new Date();
    const ROLLING_PERIODS = 7;
    let startDate: Date;
    let endDate: Date;

    switch (period) {
        case "day": {
            // Un solo día: hoy o el día según offset (0=hoy, -1=ayer, etc.)
            const targetDay = periodOffset === 0 ? now : subDays(now, Math.abs(periodOffset));
            startDate = startOfDay(targetDay);
            endDate = endOfDay(targetDay);
            break;
        }
        case "week": {
            // Semanas del mes actual (o del mes según offset: 0=actual, -1=anterior, etc.)
            const targetMonth =
                periodOffset === 0
                    ? now
                    : subMonths(now, Math.abs(periodOffset));
            startDate = startOfMonth(targetMonth);
            endDate = endOfMonth(targetMonth);
            break;
        }
        case "month": {
            // Últimos 7 meses terminando en el mes actual
            endDate =
                periodOffset === 0
                    ? endOfMonth(now)
                    : endOfMonth(subMonths(now, Math.abs(periodOffset) * ROLLING_PERIODS));
            startDate = startOfMonth(subMonths(endDate, ROLLING_PERIODS - 1));
            break;
        }
    }

    const entries = await prisma.time_entries.findMany({
        where: {
            task: { project: { client_id: context.clientId } },
            start_time: { gte: startDate, lte: endDate },
        },
        include: { breaks: true, task: { include: { project: { select: { name: true } } } } },
        orderBy: { start_time: "asc" },
    });

    const projectMap = new Map<string, string>();
    const dataMap = new Map<string, Map<string, number>>();

    for (const entry of entries) {
        const totals = computeEntryTotals(entry as any);
        const hours = totals.duration_neto / 60;
        const projectName = entry.task?.project?.name ?? "Sin proyecto";
        const entryDate = new Date(entry.start_time);
        let periodKey: string;
        switch (period) {
            case "day":
                periodKey = format(entryDate, "dd/MM");
                break;
            case "week":
                periodKey = `Sem ${format(startOfWeek(entryDate, { weekStartsOn: WEEK_STARTS_ON }), "dd/MM")}`;
                break;
            case "month":
                periodKey = format(entryDate, "MMM yyyy", { locale: es });
                break;
        }
        if (!projectMap.has(projectName)) projectMap.set(projectName, projectName);
        if (!dataMap.has(periodKey)) dataMap.set(periodKey, new Map());
        const periodData = dataMap.get(periodKey)!;
        periodData.set(projectName, (periodData.get(projectName) ?? 0) + hours);
    }

    let allPeriods: string[] = [];
    switch (period) {
        case "day":
            allPeriods = eachDayOfInterval({ start: startDate, end: endDate }).map((d) => format(d, "dd/MM"));
            break;
        case "week": {
            // Solo semanas cuyo lunes cae dentro del mes
            const weeksInMonth = eachWeekOfInterval(
                { start: startDate, end: endDate },
                { weekStartsOn: WEEK_STARTS_ON }
            ).filter((w) => w >= startDate && w <= endDate);
            allPeriods = weeksInMonth.map((w) => `Sem ${format(w, "dd/MM")}`);
            break;
        }
        case "month":
            allPeriods = eachMonthOfInterval({ start: startDate, end: endDate }).map((m) =>
                format(m, "MMM yyyy", { locale: es })
            );
            break;
    }

    const data: PortalChartDataPoint[] = allPeriods.map((periodKey) => {
        const periodData = dataMap.get(periodKey) ?? new Map();
        const point: PortalChartDataPoint = { period: periodKey, total: 0 };
        projectMap.forEach((_, projectName) => {
            const hours = periodData.get(projectName) ?? 0;
            point[projectName] = Math.round(hours * 100) / 100;
            point.total += hours;
        });
        return point;
    });

    return {
        data,
        dateRange: { start: format(startDate, "dd/MM/yyyy"), end: format(endDate, "dd/MM/yyyy") },
    };
}

export interface PortalHourlyDataPoint {
    hour: number;
    hourLabel: string;
    minutes: number;
    percent: number;
}

/**
 * Datos por hora para un día: 24 barras con % de minutos trabajados en cada hora.
 */
export async function getPortalChartDataHourly(
    dayStartIso: string
): Promise<{ data: PortalHourlyDataPoint[]; dateRange: { start: string; end: string } }> {
    const context = await getClientContext();
    if (!context) return { data: [], dateRange: { start: "", end: "" } };

    const dayStart = startOfDay(new Date(dayStartIso));
    const dayEnd = endOfDay(dayStart);

    const entries = await prisma.time_entries.findMany({
        where: {
            task: { project: { client_id: context.clientId } },
            start_time: { gte: dayStart, lte: dayEnd },
        },
        include: { breaks: true, task: { include: { project: { select: { name: true } } } } },
        orderBy: { start_time: "asc" },
    });

    const perHour = computeMinutesPerHour(dayStart, entries as any);

    const data: PortalHourlyDataPoint[] = perHour.map(({ hour, minutes, percent }) => ({
        hour,
        hourLabel: `${hour.toString().padStart(2, "0")}:00`,
        minutes,
        percent,
    }));

    return {
        data,
        dateRange: {
            start: format(dayStart, "dd/MM/yyyy"),
            end: format(dayEnd, "dd/MM/yyyy"),
        },
    };
}

/**
 * Datos para la gráfica de horas del portal en un rango fijo (drill-down: semanas o días).
 * Solo entradas del clientId de la sesión.
 */
export async function getPortalChartDataInRange(
    period: "week" | "day",
    rangeStart: string,
    rangeEnd: string
): Promise<{ data: PortalChartDataPoint[]; dateRange: { start: string; end: string } }> {
    const context = await getClientContext();
    if (!context) return { data: [], dateRange: { start: "", end: "" } };

    const startDate = startOfDay(new Date(rangeStart));
    const endDate = endOfDay(new Date(rangeEnd));

    const entries = await prisma.time_entries.findMany({
        where: {
            task: { project: { client_id: context.clientId } },
            start_time: { gte: startDate, lte: endDate },
        },
        include: { breaks: true, task: { include: { project: { select: { name: true } } } } },
        orderBy: { start_time: "asc" },
    });

    const projectMap = new Map<string, string>();
    const dataMap = new Map<string, Map<string, number>>();

    for (const entry of entries) {
        const totals = computeEntryTotals(entry as any);
        const hours = totals.duration_neto / 60;
        const projectName = entry.task?.project?.name ?? "Sin proyecto";
        const entryDate = new Date(entry.start_time);
        let periodKey: string;
        if (period === "day") {
            periodKey = format(entryDate, "dd/MM");
        } else {
            periodKey = `Sem ${format(startOfWeek(entryDate, { weekStartsOn: WEEK_STARTS_ON }), "dd/MM")}`;
        }
        if (!projectMap.has(projectName)) projectMap.set(projectName, projectName);
        if (!dataMap.has(periodKey)) dataMap.set(periodKey, new Map());
        const periodData = dataMap.get(periodKey)!;
        periodData.set(projectName, (periodData.get(projectName) ?? 0) + hours);
    }

    let allPeriods: string[] = [];
    if (period === "day") {
        allPeriods = eachDayOfInterval({ start: startDate, end: endDate }).map((d) => format(d, "dd/MM"));
    } else {
        // Solo semanas cuyo lunes cae dentro del mes clickeado (no incluir semanas que empiezan en otro mes)
        const monthStart = startOfMonth(startDate);
        const monthEnd = endOfMonth(endDate);
        const weeksInRange = eachWeekOfInterval(
            { start: startDate, end: endDate },
            { weekStartsOn: WEEK_STARTS_ON }
        ).filter((w) => w >= monthStart && w <= monthEnd);
        allPeriods = weeksInRange.map((w) => `Sem ${format(w, "dd/MM")}`);
    }

    const data: PortalChartDataPoint[] = allPeriods.map((periodKey) => {
        const periodData = dataMap.get(periodKey) ?? new Map();
        const point: PortalChartDataPoint = { period: periodKey, total: 0 };
        projectMap.forEach((_, projectName) => {
            const hours = periodData.get(projectName) ?? 0;
            point[projectName] = Math.round(hours * 100) / 100;
            point.total += hours;
        });
        return point;
    });

    return {
        data,
        dateRange: { start: format(startDate, "dd/MM/yyyy"), end: format(endDate, "dd/MM/yyyy") },
    };
}

/**
 * Distribución de horas netas por proyecto (para gráfico circular/barras).
 * Solo datos del clientId de la sesión.
 * Si se pasan rangeStart/rangeEnd (ISO), filtra por ese rango (sincronizado con drill-down).
 */
export async function getPortalProjectDistribution(options?: {
    rangeStart?: string;
    rangeEnd?: string;
}): Promise<{ name: string; value: number }[]> {
    const context = await getClientContext();
    if (!context) return [];

    const where: any = { task: { project: { client_id: context.clientId } } };
    if (options?.rangeStart != null && options?.rangeEnd != null) {
        where.start_time = {
            gte: new Date(options.rangeStart),
            lte: new Date(options.rangeEnd),
        };
    }

    const entries = await prisma.time_entries.findMany({
        where,
        include: { breaks: true, task: { include: { project: { select: { name: true } } } } },
    });

    const byProject = new Map<string, number>();
    for (const entry of entries) {
        const totals = computeEntryTotals(entry as any);
        const hours = totals.duration_neto / 60;
        const name = entry.task?.project?.name ?? "Sin proyecto";
        byProject.set(name, (byProject.get(name) ?? 0) + hours);
    }

    return Array.from(byProject.entries())
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value);
}

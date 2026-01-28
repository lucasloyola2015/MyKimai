"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { startOfDay, endOfDay } from "date-fns";

/**
 * Obtiene estadísticas para el sidebar/navegación
 * Migrado de Supabase a Prisma
 */
export async function getNavStats() {
    const user = await getAuthUser();

    // Queries en paralelo para mejor performance
    const [activeProjectsCount, pendingInvoicesCount, activeEntry, todayEntries] =
        await Promise.all([
            // Proyectos activos del usuario
            prisma.projects.count({
                where: {
                    client: {
                        user_id: user.id,
                    },
                    status: "active",
                },
            }),

            // Facturas pendientes (draft + sent)
            prisma.invoices.count({
                where: {
                    client: {
                        user_id: user.id,
                    },
                    status: {
                        in: ["draft", "sent"],
                    },
                },
            }),

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
}

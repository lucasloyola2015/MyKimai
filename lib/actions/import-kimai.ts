"use server";

import { prisma } from "@/lib/prisma/client";
import { getOwnerContext, canManageWorkspace } from "@/lib/auth/owner-context";
import { revalidatePath } from "next/cache";

export interface KimaiRow {
    Date: string;
    From: string;
    To: string;
    Duration: string;
    Currency: string;
    "Hourly price": string;
    Customer: string;
    Project: string;
    Activity: string;
    Description: string;
    Billable: string;
}

export interface ImportKimaiResult {
    success: boolean;
    message: string;
    details?: {
        clientCreated: boolean;
        projectCreated: boolean;
        taskCreated: boolean;
        timeEntriesImported: number;
    };
}

function durationToMinutes(duration: string): number {
    const parts = duration.split(":");
    if (parts.length !== 2) return 0;
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

/** Kimai exporta en hora local de Argentina (UTC-3); fijamos el offset para no
 * depender del TZ del server al construir el instante. */
function combineDateTime(date: string, time: string): Date {
    return new Date(`${date}T${time}:00-03:00`);
}

/**
 * §migrate-anon — Importa entradas de Kimai (CSV ya parseado en el cliente) vía
 * Prisma + ownerId, en lugar de supabase-js (anon). Find-or-create de
 * cliente/proyecto/tarea + insert de time_entries. El trigger de DB recalcula
 * duración/monto por fila.
 */
export async function importKimaiEntries(rows: KimaiRow[]): Promise<ImportKimaiResult> {
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, message: "Solo el dueño del workspace puede importar." };
    }
    if (!rows || rows.length === 0) {
        return { success: false, message: "El archivo CSV está vacío o no tiene el formato correcto." };
    }

    const first = rows[0];
    const clientName = (first.Customer || "").trim();
    const projectName = (first.Project || "").trim();
    const taskName = (first.Activity || "").trim();
    if (!clientName || !projectName || !taskName) {
        return { success: false, message: "Faltan columnas Customer/Project/Activity en el CSV." };
    }
    const hourlyRate = parseFloat(first["Hourly price"]) || 25;
    const currency = first.Currency || "USD";

    try {
        // 1. Cliente (find-or-create, scopeado al owner)
        let client = await prisma.clients.findFirst({
            where: { name: clientName, user_id: ctx.ownerId },
            select: { id: true },
        });
        const clientCreated = !client;
        if (!client) {
            client = await prisma.clients.create({
                data: { user_id: ctx.ownerId, name: clientName, currency, default_rate: hourlyRate },
                select: { id: true },
            });
        }

        // 2. Proyecto
        let project = await prisma.projects.findFirst({
            where: { name: projectName, client_id: client.id },
            select: { id: true },
        });
        const projectCreated = !project;
        if (!project) {
            const dates = rows.map((r) => r.Date).filter(Boolean).sort();
            project = await prisma.projects.create({
                data: {
                    client_id: client.id,
                    name: projectName,
                    currency,
                    rate: hourlyRate,
                    billing_type: "hourly",
                    status: "active",
                    start_date: dates[0] ? new Date(dates[0]) : null,
                    end_date: dates[dates.length - 1] ? new Date(dates[dates.length - 1]) : null,
                },
                select: { id: true },
            });
        }

        // 3. Tarea
        let task = await prisma.tasks.findFirst({
            where: { name: taskName, project_id: project.id },
            select: { id: true },
        });
        const taskCreated = !task;
        if (!task) {
            task = await prisma.tasks.create({
                data: { project_id: project.id, name: taskName, rate: hourlyRate },
                select: { id: true },
            });
        }

        // 4. Entradas de tiempo (el trigger recalcula duración/monto por fila)
        const taskId = task.id;
        const entries = rows.map((row) => {
            const mins = durationToMinutes(row.Duration);
            const billable = row.Billable === "1" || row.Billable === "true";
            return {
                user_id: ctx.actorId,
                task_id: taskId,
                description: row.Description || null,
                start_time: combineDateTime(row.Date, row.From),
                end_time: combineDateTime(row.Date, row.To),
                duration_total: mins,
                duration_neto: mins,
                billable,
                rate_applied: billable ? hourlyRate : 0,
            };
        });

        const created = await prisma.time_entries.createMany({ data: entries });

        revalidatePath("/dashboard/my-hours");
        revalidatePath("/dashboard");

        return {
            success: true,
            message: `Importación completada. ${created.count} entradas importadas.`,
            details: {
                clientCreated,
                projectCreated,
                taskCreated,
                timeEntriesImported: created.count,
            },
        };
    } catch (error) {
        console.error("Error importKimaiEntries:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Error durante la importación.",
        };
    }
}

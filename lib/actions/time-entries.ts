"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser, getClientContext } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { differenceInMinutes, format } from "date-fns";
import type { time_entries } from "@prisma/client";
import { calculateNetDurationMinutes, computeEntryTotals } from "@/lib/utils";
import { formatTime24 } from "@/lib/date-format";
import { getUsdExchangeRate } from "./exchange";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };


/**
 * Obtiene el time entry activo del usuario (si existe)
 */
export async function getActiveTimeEntry() {
    const user = await getAuthUser();

    const activeEntry = await prisma.time_entries.findFirst({
        where: {
            user_id: user.id,
            end_time: null,
        },
        include: {
            task: {
                include: {
                    project: {
                        include: {
                            client: true,
                        },
                    },
                },
            },
            breaks: true,
        },
    });

    return activeEntry;
}

/**
 * Obtiene las últimas time entries del usuario
 */
export async function getRecentTimeEntries(limit: number = 10) {
    const user = await getAuthUser();

    const entries = await prisma.time_entries.findMany({
        where: {
            user_id: user.id,
        },
        include: {
            task: {
                include: {
                    project: {
                        include: {
                            client: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            start_time: "desc",
        },
        take: limit,
    });

    return entries.map(entry => {
        const totals = computeEntryTotals(entry as any);
        return {
            ...entry,
            ...totals
        } as any;
    });
}

/**
 * Obtiene la última entrada completada del usuario (para precargar datos en Time Tracker)
 */
export async function getLastCompletedEntry() {
    const user = await getAuthUser();

    const entry = await prisma.time_entries.findFirst({
        where: {
            user_id: user.id,
            end_time: {
                not: null,
            },
        },
        include: {
            task: {
                include: {
                    project: {
                        include: {
                            client: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            start_time: "desc",
        },
    });

    return entry;
}

/**
 * Calcula la tarifa aplicable para una tarea
 * Cascada: task.rate → project.rate → client.default_rate → 0
 */
async function calculateRate(taskId: string): Promise<number> {
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            project: {
                include: {
                    client: true,
                },
            },
        },
    });

    if (!task) return 0;

    // Cascada de tarifas: Tarea -> Proyecto -> Cliente
    // Si una tarifa es null o 0, pasamos a la siguiente en la jerarquía.
    const taskRate = task.rate ? Number(task.rate) : 0;
    if (taskRate > 0) return taskRate;

    const projectRate = task.project.rate ? Number(task.project.rate) : 0;
    if (projectRate > 0) return projectRate;

    const clientRate = task.project.client.default_rate ? Number(task.project.client.default_rate) : 0;
    return clientRate;
}

/**
 * Inicia un nuevo time entry
 */
export async function startTimeEntry(
    taskId: string,
    description?: string
): Promise<ActionResponse<time_entries>> {
    const user = await getAuthUser();

    // Verificar que no haya un timer activo
    const existingActive = await prisma.time_entries.findFirst({
        where: {
            user_id: user.id,
            end_time: null,
        },
    });

    if (existingActive) {
        return {
            success: false,
            error: "Ya tienes un timer activo. Deténlo antes de iniciar uno nuevo.",
        };
    }

    // Verificar que la tarea existe
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
    });

    if (!task) {
        return {
            success: false,
            error: "Tarea no encontrada.",
        };
    }

    // Calcular tarifa aplicable
    const rate = await calculateRate(taskId);

    try {
        // Crear time entry
        const entry = await prisma.time_entries.create({
            data: {
                user_id: user.id,
                task_id: taskId,
                description: description || null,
                start_time: new Date(),
                end_time: null,
                duration_minutes: null,
                billable: true,
                rate_applied: Number(rate),
                amount: null,
            },
            include: {
                task: {
                    include: {
                        project: {
                            include: {
                                client: true,
                            },
                        },
                    },
                },
            },
        });

        revalidatePath("/dashboard/time-tracker");
        revalidatePath("/dashboard");

        return {
            success: true,
            data: entry,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al iniciar el timer",
        };
    }
}

/**
 * Detiene un time entry activo
 */
export async function stopTimeEntry(
    entryId: string
): Promise<ActionResponse<time_entries>> {
    const user = await getAuthUser();

    // Obtener el entry
    const entry = await prisma.time_entries.findUnique({
        where: { id: entryId },
    });

    if (!entry) {
        return {
            success: false,
            error: "Time entry no encontrado.",
        };
    }

    if (entry.user_id !== user.id) {
        return {
            success: false,
            error: "No autorizado.",
        };
    }

    if (entry.end_time) {
        return {
            success: false,
            error: "Este timer ya está detenido.",
        };
    }

    // Calcular duración y monto
    const endTime = new Date();
    const exchangeRate = await getUsdExchangeRate();

    // Obtener los breaks para restar
    const entryWithBreaks = await prisma.time_entries.findUnique({
        where: { id: entryId },
        include: { breaks: true }
    });

    // Si hay un break activo, cerrarlo con el endTime final
    const activeBreak = entryWithBreaks?.breaks.find(b => b.end_time === null);
    if (activeBreak) {
        await prisma.time_entry_breaks.update({
            where: { id: activeBreak.id },
            data: { end_time: endTime }
        });
        // Actualizar localmente para el cálculo
        if (activeBreak) activeBreak.end_time = endTime;
    }

    const grossMinutes = differenceInMinutes(endTime, entry.start_time);
    const durationMinutes = calculateNetDurationMinutes(
        entry.start_time,
        endTime,
        entryWithBreaks?.breaks || []
    );
    const rate = Number(entry.rate_applied || 0);
    const amount = Number(((durationMinutes / 60) * rate).toFixed(2));

    try {
        // Actualizar entry
        const updatedEntry = await prisma.time_entries.update({
            where: { id: entryId },
            data: {
                end_time: endTime,
                duration_minutes: Math.round(durationMinutes),
                amount: amount,
                usd_exchange_rate: exchangeRate,
            },
            include: {
                task: {
                    include: {
                        project: {
                            include: {
                                client: true,
                            },
                        },
                    },
                },
                breaks: true,
            },
        });

        revalidatePath("/dashboard/time-tracker");
        revalidatePath("/dashboard");
        revalidatePath("/dashboard/my-hours");

        return {
            success: true,
            data: updatedEntry as any, // Cast temporal para evitar problemas de tipos hasta el siguiente build
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al detener el timer",
        };
    }
}

/**
 * Elimina un time entry
 */
export async function deleteTimeEntry(entryId: string) {
    const user = await getAuthUser();

    // Verificar que el entry pertenece al usuario
    const entry = await prisma.time_entries.findUnique({
        where: { id: entryId },
    });

    if (!entry) {
        return {
            success: false,
            error: "Time entry no encontrado.",
        };
    }

    if (entry.user_id !== user.id) {
        return {
            success: false,
            error: "No autorizado.",
        };
    }

    // Eliminar
    await prisma.time_entries.delete({
        where: { id: entryId },
    });

    revalidatePath("/dashboard/time-tracker");
    revalidatePath("/dashboard/my-hours");

    return {
        success: true,
    };
}

/**
 * Obtiene las tareas disponibles para el time tracker
 */
export async function getAvailableTasks() {
    const user = await getAuthUser();

    const tasks = await prisma.tasks.findMany({
        where: {
            project: {
                client: {
                    user_id: user.id,
                },
                status: "active",
            },
        },
        include: {
            project: {
                include: {
                    client: true,
                },
            },
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return tasks;
}

/**
 * Obtiene time entries con filtros opcionales
 */
export async function getTimeEntries(filters?: {
    clientId?: string;
    projectId?: string;
    startDate?: Date;
    endDate?: Date;
    onlyCompleted?: boolean; // Solo entradas con end_time
}) {
    const user = await getAuthUser();
    const clientContext = await getClientContext();

    const where: any = {};

    if (clientContext) {
        where.task = {
            project: {
                client_id: clientContext.clientId,
            },
        };
    } else {
        where.user_id = user.id;
    }

    if (filters?.onlyCompleted) {
        where.end_time = {
            not: null,
        };
    }

    if (filters?.startDate) {
        where.start_time = {
            ...where.start_time,
            gte: filters.startDate,
        };
    }

    if (filters?.endDate) {
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.start_time = {
            ...where.start_time,
            lte: endOfDay,
        };
    }

    if (filters?.clientId) {
        where.task = {
            project: {
                client_id: filters.clientId,
            },
        };
    }

    if (filters?.projectId) {
        where.task = {
            ...where.task,
            project_id: filters.projectId,
        };
    }

    const entries = await prisma.time_entries.findMany({
        where,
        include: {
            task: {
                include: {
                    project: {
                        include: {
                            client: true,
                        },
                    },
                },
            },
            breaks: true,
        },
        orderBy: {
            start_time: "desc",
        },
    });

    return entries.map(entry => {
        const duration = entry.end_time
            ? calculateNetDurationMinutes(entry.start_time, entry.end_time, entry.breaks)
            : 0;
        const rate = Number(entry.rate_applied || 0);
        return {
            ...entry,
            duration_minutes: duration,
            amount: Number(((duration / 60) * rate).toFixed(2))
        } as any;
    });
}

/**
 * Actualiza un time entry existente
 */
export async function updateTimeEntry(
    entryId: string,
    data: {
        description?: string | null;
        start_time?: Date;
        end_time?: Date | null;
        duration_minutes?: number | null;
        billable?: boolean;
        rate_applied?: number | null;
        amount?: number | null;
    }
): Promise<ActionResponse<time_entries>> {
    const user = await getAuthUser();

    // Verificar que el entry pertenece al usuario
    const entry = await prisma.time_entries.findUnique({
        where: { id: entryId },
    });

    if (!entry) {
        return {
            success: false,
            error: "Time entry no encontrado.",
        };
    }

    if (entry.user_id !== user.id) {
        return {
            success: false,
            error: "No autorizado.",
        };
    }

    // Si se actualiza start_time o end_time, recalcular duración y monto considerando las pausas
    let updateData = { ...data };

    if (data.start_time || data.end_time !== undefined) {
        const startTime = data.start_time || entry.start_time;
        const endTime = data.end_time || entry.end_time;

        if (endTime && startTime) {
            // Obtener pausas para el cálculo neto
            const breaks = await prisma.time_entry_breaks.findMany({
                where: { time_entry_id: entryId },
            });

            const netDuration = calculateNetDurationMinutes(startTime, endTime, breaks);
            updateData.duration_minutes = netDuration;

            // Recalcular monto si hay tarifa
            const rate = data.rate_applied !== undefined
                ? (data.rate_applied || 0)
                : Number(entry.rate_applied || 0);

            updateData.amount = Number(((netDuration / 60) * rate).toFixed(2));

            // Capturar exchange rate si no lo tiene (para registros viejos o manuales)
            if (!entry.usd_exchange_rate) {
                const exchangeRate = await getUsdExchangeRate();
                (updateData as any).usd_exchange_rate = exchangeRate;
            }
        }
    }

    // Si solo se actualiza la descripción, mantener rate y amount
    if (Object.keys(updateData).length === 1 && updateData.description !== undefined) {
        updateData = {
            description: updateData.description,
        };
    }

    try {
        const updatedEntry = await prisma.time_entries.update({
            where: { id: entryId },
            data: updateData,
            include: {
                task: {
                    include: {
                        project: {
                            include: {
                                client: true,
                            },
                        },
                    },
                },
            },
        });

        revalidatePath("/dashboard/my-hours");
        revalidatePath("/dashboard/time-tracker");

        return {
            success: true,
            data: updatedEntry,
        };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Error al actualizar la entrada de tiempo",
        };
    }
}

/**
 * Actualiza solo la descripción de un time entry activo
 */
export async function updateTimeEntryDescription(
    entryId: string,
    description: string | null
): Promise<ActionResponse<time_entries>> {
    return updateTimeEntry(entryId, { description });
}

/**
 * Inicia una pausa en el time entry activo
 */
export async function pauseTimeEntry(
    entryId: string
): Promise<ActionResponse<any>> {
    const user = await getAuthUser();

    try {
        const entry = await prisma.time_entries.findUnique({
            where: { id: entryId },
            include: { breaks: true }
        });

        if (!entry || entry.user_id !== user.id) {
            return { success: false, error: "No autorizado o no encontrado" };
        }

        // Verificar si ya hay una pausa activa
        const activeBreak = entry.breaks.find(b => b.end_time === null);
        if (activeBreak) {
            return { success: false, error: "Ya existe una pausa activa" };
        }

        const breakEntry = await prisma.time_entry_breaks.create({
            data: {
                time_entry_id: entryId,
                start_time: new Date(),
            }
        });

        revalidatePath("/dashboard/time-tracker");
        revalidatePath("/dashboard");

        return { success: true, data: breakEntry };
    } catch (error) {
        console.error("Error in pauseTimeEntry:", error);
        return { success: false, error: "Error al iniciar la pausa" };
    }
}

/**
 * Reanuda el trabajo (termina la pausa activa)
 */
export async function resumeTimeEntry(
    entryId: string
): Promise<ActionResponse<any>> {
    const user = await getAuthUser();

    try {
        const entry = await prisma.time_entries.findUnique({
            where: { id: entryId },
            include: { breaks: true }
        });

        if (!entry || entry.user_id !== user.id) {
            return { success: false, error: "No autorizado o no encontrado" };
        }

        const activeBreak = entry.breaks.find(b => b.end_time === null);
        if (!activeBreak) {
            return { success: false, error: "No hay ninguna pausa activa" };
        }

        await prisma.time_entry_breaks.update({
            where: { id: activeBreak.id },
            data: { end_time: new Date() }
        });

        revalidatePath("/dashboard/time-tracker");
        revalidatePath("/dashboard");

        return { success: true, data: entry };
    } catch (error) {
        console.error("Error in resumeTimeEntry:", error);
        return { success: false, error: "Error al reanudar la jornada" };
    }
}

/**
 * Función interna para recalcular tiempo neto y monto de un entry
 */
async function recalculateEntry(entryId: string) {
    const entry = await prisma.time_entries.findUnique({
        where: { id: entryId },
        include: { breaks: true }
    });

    if (!entry || !entry.end_time) return;

    const netDuration = calculateNetDurationMinutes(entry.start_time, entry.end_time, entry.breaks);
    const rate = Number(entry.rate_applied || 0);

    const exchangeRate = entry.usd_exchange_rate || await getUsdExchangeRate();

    await prisma.time_entries.update({
        where: { id: entryId },
        data: {
            duration_minutes: netDuration,
            amount: Number(((netDuration / 60) * rate).toFixed(2)),
            usd_exchange_rate: exchangeRate
        }
    });

    revalidatePath("/dashboard/my-hours");
}

/**
 * Crea una pausa manualmente
 */
export async function addTimeEntryBreak(
    entryId: string,
    startTime: Date,
    endTime: Date | null
): Promise<ActionResponse<any>> {
    const user = await getAuthUser();
    try {
        const entry = await prisma.time_entries.findUnique({ where: { id: entryId } });
        if (!entry || entry.user_id !== user.id) return { success: false, error: "No autorizado" };

        const newBreak = await prisma.time_entry_breaks.create({
            data: { time_entry_id: entryId, start_time: startTime, end_time: endTime }
        });

        await recalculateEntry(entryId);
        return { success: true, data: newBreak };
    } catch (error) {
        return { success: false, error: "Error al crear pausa" };
    }
}

/**
 * Actualiza una pausa existente.
 * Actualización atómica: siempre se envían start_time y end_time explícitamente
 * para evitar que un "diff" o condicional filtre la fecha inicial y rompa el cálculo de horas netas.
 */
export async function updateTimeEntryBreak(
    breakId: string,
    startTime: Date,
    endTime: Date | null
): Promise<ActionResponse<any>> {
    const user = await getAuthUser();
    try {
        const breakNode = await prisma.time_entry_breaks.findUnique({
            where: { id: breakId },
            include: { time_entry: true }
        });

        if (!breakNode || breakNode.time_entry.user_id !== user.id) {
            return { success: false, error: "No autorizado" };
        }

        const updatePayload = {
            start_time: startTime,
            end_time: endTime,
        };

        const updatedBreak = await prisma.time_entry_breaks.update({
            where: { id: breakId },
            data: updatePayload,
        });

        await recalculateEntry(breakNode.time_entry_id);
        return { success: true, data: updatedBreak };
    } catch (error) {
        return { success: false, error: "Error al actualizar pausa" };
    }
}

/**
 * Elimina una pausa
 */
export async function deleteTimeEntryBreak(breakId: string): Promise<ActionResponse<any>> {
    const user = await getAuthUser();
    try {
        const breakNode = await prisma.time_entry_breaks.findUnique({
            where: { id: breakId },
            include: { time_entry: true }
        });

        if (!breakNode || breakNode.time_entry.user_id !== user.id) {
            return { success: false, error: "No autorizado" };
        }

        await prisma.time_entry_breaks.delete({ where: { id: breakId } });
        await recalculateEntry(breakNode.time_entry_id);

        return { success: true, data: null };
    } catch (error) {
        return { success: false, error: "Error al eliminar pausa" };
    }
}

export interface ConsolidationPreview {
    date: string;
    clientName: string;
    originalCount: number;
    newBreaksCount: number;
    startTime: string;
    endTime: string;
    totalDuration: number;
}

/**
 * Genera una vista previa de la consolidación de registros de tiempo
 */
export async function previewConsolidation(): Promise<ConsolidationPreview[]> {
    const user = await getAuthUser();

    const entries = await prisma.time_entries.findMany({
        where: {
            user_id: user.id,
            end_time: { not: null }
        },
        include: {
            task: {
                include: {
                    project: {
                        include: {
                            client: true,
                        },
                    },
                },
            },
        },
        orderBy: { start_time: "asc" },
    });

    const groups: Record<string, any[]> = {};

    entries.forEach((entry: any) => {
        const dateKey = format(entry.start_time, "yyyy-MM-dd");
        const clientId = entry.task.project.client.id;
        const groupKey = `${dateKey}_${clientId}`;

        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(entry);
    });

    const previews: ConsolidationPreview[] = [];

    for (const key in groups) {
        const group = groups[key];
        if (group.length <= 1) continue;

        const first = group[0];
        const last = group[group.length - 1];
        const clientName = first.task.project.client.name;
        const date = format(first.start_time, "dd/MM/yyyy");

        let breaksCount = 0;
        for (let i = 0; i < group.length - 1; i++) {
            const currentEnd = group[i].end_time!;
            const nextStart = group[i + 1].start_time;
            if (differenceInMinutes(nextStart, currentEnd) > 1) {
                breaksCount++;
            }
        }

        previews.push({
            date,
            clientName,
            originalCount: group.length,
            newBreaksCount: breaksCount,
            startTime: formatTime24(first.start_time),
            endTime: formatTime24(last.end_time!),
            totalDuration: differenceInMinutes(last.end_time!, first.start_time),
        });
    }

    return previews;
}

/**
 * Ejecuta la consolidación de registros de tiempo
 */
export async function executeConsolidation() {
    const user = await getAuthUser();

    const entries = await prisma.time_entries.findMany({
        where: {
            user_id: user.id,
            end_time: { not: null }
        },
        include: {
            task: {
                include: {
                    project: {
                        include: {
                            client: true,
                        },
                    },
                },
            },
            breaks: true,
        },
        orderBy: { start_time: "asc" },
    });

    const groups: Record<string, any[]> = {};
    entries.forEach((entry: any) => {
        const dateKey = format(entry.start_time, "yyyy-MM-dd");
        const clientId = entry.task.project.client.id;
        const groupKey = `${dateKey}_${clientId}`;
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(entry);
    });

    const results = {
        consolidated: 0,
        removed: 0,
        breaksCreated: 0,
    };

    await prisma.$transaction(async (tx) => {
        for (const key in groups) {
            const group = groups[key];
            if (group.length <= 1) continue;

            const first = group[0];
            const last = group[group.length - 1];
            const originalIds = group.map((e) => e.id);

            const allBreaks = group.flatMap((e: any) => e.breaks || []);

            const newBreaksData: { start_time: Date; end_time: Date }[] = [];
            for (let i = 0; i < group.length - 1; i++) {
                const currentEnd = group[i].end_time!;
                const nextStart = group[i + 1].start_time;
                if (differenceInMinutes(nextStart, currentEnd) > 1) {
                    newBreaksData.push({
                        start_time: currentEnd,
                        end_time: nextStart,
                    });
                }
            }

            const totalMinutes = differenceInMinutes(last.end_time!, first.start_time);
            const netDuration = calculateNetDurationMinutes(
                first.start_time,
                last.end_time!,
                [...allBreaks, ...newBreaksData]
            );

            const rate = Number(first.rate_applied || 0);
            const amount = Number(((netDuration / 60) * rate).toFixed(2));

            const masterEntry = await (tx.time_entries as any).create({
                data: {
                    user_id: user.id,
                    task_id: first.task_id,
                    description: group
                        .map((e: any) => e.description)
                        .filter(Boolean)
                        .join(" | "),
                    start_time: first.start_time,
                    end_time: last.end_time,
                    duration_minutes: Math.round(netDuration),
                    billable: first.billable,
                    rate_applied: first.rate_applied,
                    amount: amount,
                    is_billed: group.some((e: any) => e.is_billed),
                },
            });

            for (const b of allBreaks) {
                await (tx.time_entry_breaks as any).create({
                    data: {
                        time_entry_id: masterEntry.id,
                        start_time: b.start_time,
                        end_time: b.end_time,
                    }
                });
            }

            for (const nb of newBreaksData) {
                await (tx.time_entry_breaks as any).create({
                    data: {
                        time_entry_id: masterEntry.id,
                        start_time: nb.start_time,
                        end_time: nb.end_time,
                    }
                });
                results.breaksCreated++;
            }

            await tx.time_entries.deleteMany({
                where: { id: { in: originalIds } },
            });

            results.consolidated++;
            results.removed += originalIds.length;
        }
    });

    revalidatePath("/dashboard/my-hours");
    return results;
}

/**
 * Recalcula la tarifa y el monto de un time entry basado en la configuración actual
 * de la tarea/proyecto/cliente.
 */
export async function recalculateTimeEntryRate(entryId: string): Promise<ActionResponse<time_entries>> {
    const user = await getAuthUser();

    try {
        // 1. Obtener el entry con sus relaciones
        const entry = await prisma.time_entries.findUnique({
            where: { id: entryId },
            include: {
                task: true,
                breaks: true
            }
        });

        if (!entry) return { success: false, error: "Entrada no encontrada" };
        if (entry.user_id !== user.id) return { success: false, error: "No autorizado" };
        if (entry.is_billed) return { success: false, error: "No se puede recalcular una entrada ya facturada" };

        // 2. Calcular la nueva tarifa usando la lógica de cascada existente
        const newRate = await calculateRate(entry.task_id);

        // 3. Recalcular la duración neta y el monto
        // Si el entry está en curso (end_time null), usamos 'now' para el cálculo visual,
        // pero solo actualizamos duration_minutes si el entry ya terminó.
        let amount: any = entry.amount;
        let durationMinutes = entry.duration_minutes;

        const effectiveEndTime = entry.end_time || new Date();
        const netDuration = calculateNetDurationMinutes(entry.start_time, effectiveEndTime, entry.breaks);

        // Calculamos el monto basado en la duración neta (esté terminada o no)
        amount = Number(((netDuration / 60) * newRate).toFixed(2));

        // Solo actualizamos la persistencia de duration_minutes si la entrada ya cerró
        if (entry.end_time) {
            durationMinutes = netDuration;
        }

        // 4. Actualizar en DB
        const updatedEntry = await prisma.time_entries.update({
            where: { id: entryId },
            data: {
                rate_applied: newRate as any,
                amount: amount as any,
                duration_minutes: durationMinutes
            },
            include: {
                task: {
                    include: {
                        project: {
                            include: {
                                client: true,
                            },
                        },
                    },
                },
            }
        });

        revalidatePath("/dashboard/my-hours");
        revalidatePath("/dashboard/time-tracker");

        return { success: true, data: updatedEntry };
    } catch (error) {
        console.error("Error recalculating rate:", error);
        return { success: false, error: "Error al recalcular la tarifa" };
    }
}


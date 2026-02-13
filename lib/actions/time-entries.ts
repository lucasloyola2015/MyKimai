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
            tasks: {
                include: {
                    projects: {
                        include: {
                            clients: true,
                        },
                    },
                },
            },
            time_entry_breaks: true,
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
            tasks: {
                include: {
                    projects: {
                        include: {
                            clients: true,
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
            tasks: {
                include: {
                    projects: {
                        include: {
                            clients: true,
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
            projects: {
                include: {
                    clients: true,
                },
            },
        },
    });

    if (!task) return 0;

    // SSOT de Facturabilidad: Si no es facturable en la jerarquía, la tarifa es obligatoriamente 0.
    const isBillableTask = !!(task as any).is_billable;
    const isBillableProject = !!(task.projects as any).is_billable;
    const isBillableClient = !!(task.projects.clients as any).is_billable;

    const isBillable = isBillableTask && isBillableProject && isBillableClient;

    // Si no es facturable, la tarifa es 0 sin importar lo que diga el campo rate
    if (!isBillable) return 0;

    // Cascada de tarifas: Tarea -> Proyecto -> Cliente
    const taskRate = task.rate ? Number(task.rate) : 0;
    if (taskRate > 0) return taskRate;

    const projectRate = task.projects.rate ? Number(task.projects.rate) : 0;
    if (projectRate > 0) return projectRate;

    const clientRate = task.projects.clients.default_rate ? Number(task.projects.clients.default_rate) : 0;
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

    // Verificar que la tarea existe y obtener su jerarquía de facturación
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            projects: {
                include: {
                    clients: true,
                },
            },
        },
    });

    if (!task) {
        return {
            success: false,
            error: "Tarea no encontrada.",
        };
    }

    const isBillable = !!(task as any).is_billable && !!(task.projects as any).is_billable && !!(task.projects.clients as any).is_billable;

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
                duration_total: null,
                duration_neto: 0,
                billable: isBillable,
                amount: null,

            },
            include: {
                tasks: {
                    include: {
                        projects: {
                            include: {
                                clients: true,
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

    const endTime = new Date();
    const exchangeRate = await getUsdExchangeRate();

    // Obtenemos la tarifa de la SSOT (calculateRate ya maneja la jerarquía de facturabilidad)
    const rate = await calculateRate(entry.task_id);

    // Calculamos duración neta para el blindaje financiero en código
    const currentBreaks = await prisma.time_entry_breaks.findMany({
        where: { time_entry_id: entryId }
    });
    const netDuration = calculateNetDurationMinutes(entry.start_time, endTime, currentBreaks);
    const finalAmount = rate === 0 ? 0 : Number(((netDuration / 60) * rate).toFixed(2));

    try {
        // Actualizar entry con el monto calculado por la SSOT del código
        const updatedEntry = await prisma.time_entries.update({
            where: { id: entryId },
            data: {
                end_time: endTime,
                usd_exchange_rate: exchangeRate,
                rate_applied: rate,
                amount: finalAmount,
                billable: rate > 0,
                updated_at: new Date(), // Forzar disparador (pero ya enviamos el amount)
            },
            include: {
                tasks: {
                    include: {
                        projects: {
                            include: {
                                clients: true,
                            },
                        },
                    },
                },
                time_entry_breaks: true,
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
            projects: {
                clients: {
                    user_id: user.id,
                },
                status: "active",
            },
        },
        include: {
            projects: {
                include: {
                    clients: true,
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
        where.tasks = {
            projects: {
                client_id: clientContext.clientId,
            },
        };
    } else {
        // Para admin, ver todas las entradas de sus clientes
        where.tasks = {
            projects: {
                clients: {
                    user_id: user.id
                }
            }
        };
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
        where.tasks = {
            ...where.tasks,
            projects: {
                ...where.tasks?.projects,
                client_id: filters.clientId,
            },
        };
    }

    if (filters?.projectId) {
        where.tasks = {
            ...where.tasks,
            project_id: filters.projectId,
        };
    }

    const entries = await prisma.time_entries.findMany({
        where,
        include: {
            tasks: {
                include: {
                    projects: {
                        include: {
                            clients: true,
                        },
                    },
                },
            },
            time_entry_breaks: true,
        },
        orderBy: {
            start_time: "desc",
        },
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
 * Actualiza un time entry existente
 */
export async function updateTimeEntry(
    entryId: string,
    data: {
        description?: string | null;
        start_time?: Date;
        end_time?: Date | null;
        duration_total?: number | null;
        duration_neto?: number | null;
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

    if (data.start_time || data.end_time !== undefined || data.rate_applied !== undefined) {
        // El trigger DB se encargará de recalcular todo si detecta cambios o updated_at
        (updateData as any).updated_at = new Date();
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
                tasks: {
                    include: {
                        projects: {
                            include: {
                                clients: true,
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
            include: { time_entry_breaks: true }
        });

        if (!entry || entry.user_id !== user.id) {
            return { success: false, error: "No autorizado o no encontrado" };
        }

        // Verificar si ya hay una pausa activa
        const activeBreak = entry.time_entry_breaks.find(b => b.end_time === null);
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
            include: { time_entry_breaks: true }
        });

        if (!entry || entry.user_id !== user.id) {
            return { success: false, error: "No autorizado o no encontrado" };
        }

        const activeBreak = entry.time_entry_breaks.find(b => b.end_time === null);
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

async function recalculateEntry(entryId: string) {
    const entry = await prisma.time_entries.findUnique({
        where: { id: entryId },
        include: { time_entry_breaks: true }
    });

    if (!entry || !entry.end_time) return;

    await prisma.time_entries.update({
        where: { id: entryId },
        data: {
            updated_at: new Date() // El trigger DB recalcula duration_total, neto y amount
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
            include: { time_entries: true }
        });

        if (!breakNode || breakNode.time_entries.user_id !== user.id) {
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
            include: { time_entries: true }
        });

        if (!breakNode || breakNode.time_entries.user_id !== user.id) {
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
            tasks: {
                include: {
                    projects: {
                        include: {
                            clients: true,
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
        const clientId = entry.tasks.projects.clients.id;
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
        const clientName = first.tasks.projects.clients.name;
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
            tasks: {
                include: {
                    projects: {
                        include: {
                            clients: true,
                        },
                    },
                },
            },
            time_entry_breaks: true,
        },
        orderBy: { start_time: "asc" },
    });

    const groups: Record<string, any[]> = {};
    entries.forEach((entry: any) => {
        const dateKey = format(entry.start_time, "yyyy-MM-dd");
        const clientId = entry.tasks.projects.clients.id;
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

            const allBreaks = group.flatMap((e: any) => e.time_entry_breaks || []);

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
            const isBillable = first.billable;
            const amount = isBillable ? Number(((netDuration / 60) * rate).toFixed(2)) : 0;

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
                    duration_total: Math.round(totalMinutes),
                    duration_neto: Math.round(netDuration),
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
/**
 * Función centralizada para recalcular el monto de una entrada.
 * Sigue la misión de blindaje financiero delegando la cascada a la DB.
 */
export async function calculateEntryAmount(entryId: string): Promise<ActionResponse<time_entries>> {
    const user = await getAuthUser();

    try {
        const currentEntry = await prisma.time_entries.findUnique({
            where: { id: entryId },
        });

        if (!currentEntry) throw new Error("Entrada no encontrada");

        // Obtenemos la tarifa de la SSOT (calculateRate ya maneja la jerarquía de facturabilidad)
        const rate = await calculateRate(currentEntry.task_id);
        const durationNeto = currentEntry.duration_neto || 0;

        // Blindaje total: Si el rate es 0 (no facturable), forzamos amount a 0.
        const finalAmount = rate === 0 ? 0 : Number(((durationNeto / 60) * rate).toFixed(2));
        const isBillable = rate > 0;

        const updatedEntry = await prisma.time_entries.update({
            where: { id: entryId },
            data: {
                rate_applied: rate,
                amount: finalAmount,
                billable: isBillable,
                updated_at: new Date(),
            },

            // Incluimos las relaciones para devolver el objeto completo a la UI
            include: {
                tasks: {
                    include: {
                        projects: {
                            include: {
                                clients: true,
                            },
                        },
                    },
                },
            },
        });

        revalidatePath("/dashboard/my-hours");
        revalidatePath("/dashboard/time-tracker");

        return { success: true, data: updatedEntry };
    } catch (error) {
        console.error("Error calculating entry amount:", error);
        return { success: false, error: "Error al recalcular el monto financiero" };
    }
}

// Mantener el nombre anterior por compatibilidad con la UI si es necesario, 
// pero redirigir a la nueva función centralizada.
export const recalculateTimeEntryRate = calculateEntryAmount;

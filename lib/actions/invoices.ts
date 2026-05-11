"use server";

import { prisma } from "@/lib/prisma/client";
import { getClientContext } from "@/lib/auth/server";
import {
    getOwnerContext,
    canManageWorkspace,
    canSeeFinancials,
} from "@/lib/auth/owner-context";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import type { invoices, invoice_items, invoice_status, billing_type_invoice } from "@prisma/client";
import { getUsdExchangeRate } from "./exchange";
import { PUNTO_VENTA_DEFAULT } from "@/lib/fiscal-config";
import { resolveRate } from "@/lib/utils/rates";
import {
    createInvoiceFromTimeEntriesSchema,
    updateInvoiceStatusSchema,
    deleteInvoiceSchema,
} from "@/lib/validations/invoices";
import { ZodError } from "zod";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Convierte un ZodError en un mensaje legible para devolver al cliente.
 */
function zodErrorMessage(err: ZodError): string {
    return err.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ");
}

/**
 * Obtiene todas las facturas del usuario autenticado
 */
export async function getInvoices() {
    const clientContext = await getClientContext();

    const where: any = {};
    if (clientContext) {
        where.client_id = clientContext.clientId;
    } else {
        const ctx = await getOwnerContext();
        // §5/F2.D — collaborator NO ve invoices del workspace
        if (!canSeeFinancials(ctx)) {
            return [];
        }
        where.clients = {
            user_id: ctx.ownerId,
        };
    }

    const invoices = await prisma.invoices.findMany({
        where,
        include: {
            clients: true,
            invoice_items: true,
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return invoices;
}

/**
 * Obtiene una factura con todos sus items
 */
export async function getInvoiceWithItems(id: string) {
    const clientContext = await getClientContext();

    const where: any = { id };
    if (clientContext) {
        where.client_id = clientContext.clientId;
    } else {
        const ctx = await getOwnerContext();
        if (!canSeeFinancials(ctx)) {
            return null;
        }
        where.clients = {
            user_id: ctx.ownerId,
        };
    }

    const invoice = await prisma.invoices.findFirst({
        where,
        include: {
            clients: true,
            invoice_items: {
                include: {
                    time_entries: {
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
                    },
                },
            },
        },
    });

    return invoice;
}

/**
 * Obtiene los períodos de tiempo sin facturar del usuario
 */
export async function getUnbilledTimeEntries(clientId?: string) {
    // §5 — workspace-wide: Lucas factura entradas cargadas por él Y por
    // sus team members. Filtramos por la propiedad del cliente del task.
    const ctx = await getOwnerContext();
    if (!canSeeFinancials(ctx)) {
        return [];
    }

    return await prisma.time_entries.findMany({
        where: {
            tasks: {
                projects: {
                    ...(clientId && { client_id: clientId }),
                    clients: {
                        user_id: ctx.ownerId,
                    },
                },
            },
            billable: true,
            is_billed: false,
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
}

/**
 * Obtiene los IDs de time entries ya facturados
 */
export async function getBilledTimeEntryIds() {
    const ctx = await getOwnerContext();

    const billedItems = await prisma.invoice_items.findMany({
        where: {
            invoices: {
                clients: {
                    user_id: ctx.ownerId,
                },
            },
            time_entry_id: {
                not: null,
            },
        },
        select: {
            time_entry_id: true,
        },
    });

    return billedItems
        .map((item) => item.time_entry_id)
        .filter((id): id is string => Boolean(id));
}

/**
 * Genera el próximo número de factura según el tipo (LEGAL o INTERNAL).
 * - LEGAL: prefijo INV (ej. INV-2026-001).
 * - INTERNAL: prefijo INT (ej. INT-2026-001).
 * La secuencia es independiente por tipo y por año; la restricción única en
 * invoice_number evita duplicados; en caso de carrera se reintenta la transacción.
 */
async function generateInvoiceNumber(type: billing_type_invoice = "LEGAL", tx?: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = type === "INTERNAL" ? "INT" : "INV";
    const client = tx || prisma;

    const lastInvoice = await client.invoices.findFirst({
        where: {
            invoice_number: { startsWith: `${prefix}-${year}-` },
            billing_type: type,
        },
        orderBy: { invoice_number: "desc" },
    });

    if (!lastInvoice) {
        return `${prefix}-${year}-001`;
    }

    const lastNumber = parseInt(lastInvoice.invoice_number.split("-")[2] || "0", 10);
    const nextNumber = (lastNumber + 1).toString().padStart(3, "0");
    return `${prefix}-${year}-${nextNumber}`;
}

/**
 * Crea una nueva factura desde períodos de trabajo sin facturar
 */
export async function createInvoiceFromTimeEntries(data: {
    client_id: string;
    time_entry_ids: string[];
    tax_rate?: number;
    due_date?: Date | null;
    notes?: string | null;
    billing_type?: billing_type_invoice;
    currency?: string;
    exchange_strategy?: "CURRENT" | "HISTORICAL";
    cbte_tipo?: number; // Tipo de comprobante AFIP (11 = Factura C)
}): Promise<ActionResponse<invoices>> {
    // §4.5 — validación de input
    const parsed = createInvoiceFromTimeEntriesSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede emitir facturas.",
        };
    }

    // Verificar que el cliente pertenece al workspace
    const client = await prisma.clients.findFirst({
        where: {
            id: data.client_id,
            user_id: ctx.ownerId,
        },
    });

    if (!client) {
        return {
            success: false,
            error: "Cliente no encontrado.",
        };
    }

    // Obtener los time entries del workspace (cualquier autor: el owner
    // factura entradas suyas Y las de sus team members).
    const timeEntries = await prisma.time_entries.findMany({
        where: {
            id: {
                in: data.time_entry_ids,
            },
            billable: true,
            tasks: {
                projects: {
                    client_id: data.client_id,
                    clients: {
                        user_id: ctx.ownerId,
                    },
                },
            },
        },
        include: {
            tasks: {
                include: {
                    projects: {
                        include: { clients: true },
                    },
                },
            },
        },
    });

    if (timeEntries.length === 0) {
        return {
            success: false,
            error: "No hay períodos de trabajo válidos para facturar.",
        };
    }

    // §F4.5 — Validar que NO se mezclen proyectos con stakeholders distintos.
    // Si el cliente tiene client_users con visibilidad granular
    // (`sees_all_projects = false`) y los items vienen de varios proyectos,
    // todos los proyectos deben tener exactamente el mismo conjunto de
    // stakeholders activos. Caso contrario, alguno de los stakeholders
    // vería un total que mezcla horas que NO le pertenecen.
    const distinctProjectIds = Array.from(
        new Set(timeEntries.map((e: any) => e.tasks.project_id as string))
    );
    if (distinctProjectIds.length > 1) {
        // Hay stakeholders con visibilidad granular?
        const granularStakeholders = await prisma.client_users.findMany({
            where: { client_id: data.client_id, sees_all_projects: false },
            select: { id: true },
        });
        if (granularStakeholders.length > 0) {
            // Para cada proyecto, traer el conjunto de client_user_ids con acceso activo
            const accessByProject = await prisma.project_access.findMany({
                where: {
                    project_id: { in: distinctProjectIds },
                    revoked_at: null,
                },
                select: { project_id: true, client_user_id: true },
            });
            const setsByProject = new Map<string, Set<string>>();
            for (const pid of distinctProjectIds) setsByProject.set(pid, new Set());
            for (const a of accessByProject) {
                setsByProject.get(a.project_id)?.add(a.client_user_id);
            }
            // Comparar todos los conjuntos contra el primero
            const sets = Array.from(setsByProject.values());
            const reference = sets[0];
            const allEqual = sets.every(
                (s) =>
                    s.size === reference.size &&
                    [...s].every((id) => reference.has(id))
            );
            if (!allEqual) {
                return {
                    success: false,
                    error:
                        "No se puede emitir una factura que mezcla proyectos con stakeholders distintos. " +
                        "Generá una factura por proyecto (o conjunto de proyectos con los mismos stakeholders).",
                };
            }
        }
    }

    // Calcular monto dinámico por entry usando resolveRate (SSOT)
    const entriesWithDynamicAmount = timeEntries.map((e: any) => {
        const { rate } = resolveRate({ task: e.tasks, project: e.tasks.projects, client: e.tasks.projects.clients });
        const effectiveRate = rate ?? Number(e.rate_applied || 0);
        const hours = (e.duration_neto || 0) / 60;
        const dynamicAmount = Number((hours * effectiveRate).toFixed(2));
        return { ...e, _dynamicAmount: dynamicAmount, _dynamicRate: effectiveRate };
    });

    // Calcular totales basados en moneda y estrategia
    const billingCurrency = data.currency || client.currency;
    const strategy = data.exchange_strategy || "CURRENT";

    let subtotal = 0;
    let currentExchangeRate = 0;

    if (billingCurrency === "ARS") {
        if (strategy === "CURRENT") {
            currentExchangeRate = await getUsdExchangeRate();
            const totalUsd = entriesWithDynamicAmount.reduce((sum, e) => sum + e._dynamicAmount, 0);
            subtotal = totalUsd * currentExchangeRate;
        } else {
            subtotal = entriesWithDynamicAmount.reduce((sum, e) => {
                const xRate = Number(e.usd_exchange_rate || 1050);
                return sum + (e._dynamicAmount * xRate);
            }, 0);
        }
    } else {
        subtotal = entriesWithDynamicAmount.reduce((sum, e) => sum + e._dynamicAmount, 0);
    }

    const taxRate = data.tax_rate || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    const MAX_RETRIES = 3; // Reintentos si hay colisión de número (comprobante interno o legal)
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Crear factura e items en una transacción (número único por tipo y año)
            const result = await prisma.$transaction(async (tx) => {
            // Generar número de factura según tipo
            const billingType = data.billing_type || "LEGAL";
            const invoiceNumber = await generateInvoiceNumber(billingType, tx);

            // Notas: Evitar undefined
            let invoiceNotes = data.notes || null;
            if (!invoiceNotes && strategy === "CURRENT" && billingCurrency === "ARS") {
                invoiceNotes = `TC: ${currentExchangeRate} (ARS/USD)`;
            }

            // Crear factura
            const invoice = await tx.invoices.create({
                data: {
                    client_id: data.client_id,
                    invoice_number: invoiceNumber,
                    status: "draft",
                    billing_type: billingType,
                    subtotal,
                    tax_rate: taxRate,
                    tax_amount: taxAmount,
                    total_amount: totalAmount,
                    currency: billingCurrency,
                    due_date: data.due_date ? new Date(data.due_date) : null,
                    notes: invoiceNotes,
                    // Campos AFIP (solo si es LEGAL)
                    cbte_tipo: billingType === "LEGAL" ? (data.cbte_tipo || 11) : null,
                    punto_venta: billingType === "LEGAL" ? PUNTO_VENTA_DEFAULT : null,
                },
            });

            // Congelar rate_applied/amount y marcar como facturados en un solo updateMany por entry
            // (no se puede hacer con un solo updateMany porque cada entry tiene valores distintos)
            for (const entry of entriesWithDynamicAmount) {
                await tx.time_entries.update({
                    where: { id: entry.id },
                    data: {
                        rate_applied: entry._dynamicRate,
                        amount: entry._dynamicAmount,
                        is_billed: true,
                        invoice_id: invoice.id,
                        updated_at: new Date(),
                    },
                });
            }

            // Agrupar entries por proyecto para crear 1 item por proyecto
            const projectGroups = new Map<string, {
                projectName: string;
                totalHours: number;
                totalAmountUsd: number;
                rate: number;
                minDate: Date;
                maxDate: Date;
            }>();

            for (const entry of entriesWithDynamicAmount) {
                const projectId = (entry as any).tasks.projects.id;
                const projectName = (entry as any).tasks.projects.name || "Trabajo";
                const hours = (entry.duration_neto || 0) / 60;
                const entryDate = new Date(entry.start_time);

                const existing = projectGroups.get(projectId);
                if (existing) {
                    existing.totalHours += hours;
                    existing.totalAmountUsd += entry._dynamicAmount;
                    if (entryDate < existing.minDate) existing.minDate = entryDate;
                    if (entryDate > existing.maxDate) existing.maxDate = entryDate;
                } else {
                    projectGroups.set(projectId, {
                        projectName,
                        totalHours: hours,
                        totalAmountUsd: entry._dynamicAmount,
                        rate: entry._dynamicRate,
                        minDate: entryDate,
                        maxDate: entryDate,
                    });
                }
            }

            // Crear 1 invoice_item por proyecto
            for (const [, group] of projectGroups) {
                const dateRange = `${format(group.minDate, "dd/MM")} - ${format(group.maxDate, "dd/MM/yyyy")}`;
                const description = `${group.projectName} (${dateRange})`;

                let itemRate = group.rate;
                let itemAmount = group.totalAmountUsd;

                if (billingCurrency === "ARS") {
                    // Para ARS, usar tasa de cambio uniforme (CURRENT o promedio histórico)
                    const xRate = strategy === "CURRENT"
                        ? currentExchangeRate
                        : (() => {
                            // Promedio ponderado de tasas históricas del grupo
                            const totalWeighted = entriesWithDynamicAmount
                                .filter((e: any) => e.tasks.projects.id === Array.from(projectGroups.entries()).find(([, g]) => g === group)?.[0])
                                .reduce((sum, e) => sum + (e._dynamicAmount * Number(e.usd_exchange_rate || 1050)), 0);
                            return group.totalAmountUsd > 0 ? totalWeighted / group.totalAmountUsd : 1050;
                        })();
                    itemRate = itemRate * xRate;
                    itemAmount = itemAmount * xRate;
                }

                await tx.invoice_items.create({
                    data: {
                        invoice_id: invoice.id,
                        time_entry_id: null,
                        description,
                        quantity: Number(group.totalHours.toFixed(2)),
                        rate: Number(itemRate.toFixed(2)),
                        amount: Number(itemAmount.toFixed(2)),
                        type: "time",
                    },
                });
            }

            return invoice;
            }, { timeout: 15000 });

            revalidatePath("/dashboard/invoices");
            revalidatePath("/dashboard");

            return {
                success: true,
                data: result,
            };
        } catch (error: any) {
            lastError = error;
            const isUniqueViolation =
                error?.code === "P2002" &&
                (error?.meta?.target?.includes("invoice_number") ?? error?.meta?.modelName === "invoices");
            if (isUniqueViolation && attempt < MAX_RETRIES) {
                continue; // Reintentar con nuevo número
            }
            break;
        }
    }

    console.error("DEBUG INVOICE CREATION ERROR:", lastError);
    const err = lastError as any;
    return {
        success: false,
        error:
            err instanceof Error
                ? err.message
                : "Error desconocido al crear la factura.",
    };
}

/**
 * Elimina una factura interna y libera las horas asociadas
 */
export async function deleteInvoice(id: string): Promise<ActionResponse<void>> {
    // §4.5 — validación de input
    const parsed = deleteInvoiceSchema.safeParse({ id });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede eliminar facturas.",
        };
    }

    // 1. Obtener la factura y validar que pertenece al workspace
    const invoice = await prisma.invoices.findFirst({
        where: {
            id,
            clients: {
                user_id: ctx.ownerId,
            },
        },
        include: {
            invoice_items: {
                where: {
                    type: "time",
                    time_entry_id: { not: null }
                }
            }
        }
    });

    if (!invoice) {
        return { success: false, error: "Factura no encontrada." };
    }

    // 2. No se puede eliminar si ya tiene CAE (comprobante autorizado por AFIP); en ese caso anular con Nota de Crédito
    if (invoice.cae) {
        return {
            success: false,
            error: "No se puede eliminar una factura ya autorizada por AFIP. Debe anularse mediante Nota de Crédito."
        };
    }

    try {
        await prisma.$transaction(async (tx) => {
            // A. Liberar todas las TimeEntries vinculadas a esta factura
            // (busca por invoice_id directo, no por invoice_items.time_entry_id
            //  ya que los items agrupados por proyecto tienen time_entry_id = null)
            await tx.time_entries.updateMany({
                where: {
                    is_billed: true,
                    invoice_id: id,
                },
                data: {
                    is_billed: false,
                    invoice_id: null,
                },
            });

            // C. Eliminar la factura (items se borran por cascade en DB)
            await tx.invoices.delete({
                where: { id }
            });
        });

        revalidatePath("/dashboard/invoices");
        revalidatePath("/dashboard");
        revalidatePath(`/dashboard/billing/select/${invoice.client_id}`);

        return { success: true, data: undefined as any };
    } catch (error: any) {
        console.error("DELETE INVOICE ERROR:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al eliminar la factura."
        };
    }
}

/**
 * Actualiza el estado de una factura
 */
export async function updateInvoiceStatus(
    id: string,
    status: invoice_status
): Promise<ActionResponse<invoices>> {
    // §4.5 — validación de input
    const parsed = updateInvoiceStatusSchema.safeParse({ id, status });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede cambiar el estado de facturas.",
        };
    }

    // Verificar que la factura pertenece al workspace
    const existing = await prisma.invoices.findFirst({
        where: {
            id,
            clients: {
                user_id: ctx.ownerId,
            },
        },
    });

    if (!existing) {
        return {
            success: false,
            error: "Factura no encontrada.",
        };
    }

    try {
        const updateData: {
            status: invoice_status;
            paid_at?: Date;
        } = {
            status,
        };

        if (status === "paid") {
            updateData.paid_at = new Date();
        }

        const invoice = await prisma.invoices.update({
            where: { id },
            data: updateData as any, // Cast to any to avoid enum sync issues if they haven't reloaded
            include: {
                clients: true,
            },
        });

        revalidatePath("/dashboard/invoices");
        revalidatePath(`/dashboard/invoices/${id}`);

        return {
            success: true,
            data: invoice,
        };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Error al actualizar el estado de la factura",
        };
    }
}

/**
 * Obtiene resumen de facturación por cliente
 */
export async function getClientBillingSummary() {
    const ctx = await getOwnerContext();
    // §F2.D — collaborator no ve resumen financiero por cliente
    if (!canSeeFinancials(ctx)) {
        return [];
    }

    const clients = await prisma.clients.findMany({
        where: {
            user_id: ctx.ownerId,
        },
        include: {
            invoices: true,
        },
    });

    // Obtener todos los time entries facturables (workspace-wide)
    const allEntries = await prisma.time_entries.findMany({
        where: {
            tasks: {
                projects: {
                    clients: {
                        user_id: ctx.ownerId,
                    },
                },
            },
            billable: true,
            is_billed: false,
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
            invoice_items: {
                select: {
                    id: true,
                },
            },
        },
    });

    const unbilledEntries = allEntries;

    // Calcular resumen por cliente
    const summaries = clients.map((client) => {
        // Entradas sin facturar de este cliente
        const clientUnbilledEntries = unbilledEntries.filter(
            (entry: any) =>
                entry.tasks?.projects?.clients?.id === client.id
        );

        const unbilledMinutes = clientUnbilledEntries.reduce(
            (sum, entry) => sum + (entry.duration_neto || 0),
            0
        );
        const unbilledAmount = clientUnbilledEntries.reduce(
            (sum, entry: any) => {
                const task = entry.tasks;
                const project = task?.projects;
                const cl = project?.clients;
                const { rate } = resolveRate({ task, project, client: cl });
                const effectiveRate = rate ?? Number(entry.rate_applied || 0);
                const hours = (entry.duration_neto || 0) / 60;
                return sum + Number((hours * effectiveRate).toFixed(2));
            },
            0
        );

        // Facturas no pagadas (draft o sent)
        const clientUnpaidInvoices = client.invoices.filter(
            (inv) => inv.status === "draft" || inv.status === "sent"
        );
        const billedUnpaidAmount = clientUnpaidInvoices.reduce(
            (sum, inv) => sum + Number(inv.total_amount || 0),
            0
        );

        // Facturas pagadas
        const clientPaidInvoices = client.invoices.filter(
            (inv) => inv.status === "paid"
        );
        const billedPaidAmount = clientPaidInvoices.reduce(
            (sum, inv) => sum + Number(inv.total_amount || 0),
            0
        );

        return {
            clientId: client.id,
            clientName: client.name,
            currency: client.currency,
            unbilledHours: unbilledMinutes,
            unbilledAmount,
            billedUnpaidAmount,
            billedPaidAmount,
        };
    });

    return summaries;
}

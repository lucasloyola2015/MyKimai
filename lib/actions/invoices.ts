"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser, getClientContext } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import type { invoices, invoice_items, InvoiceStatus, billing_type_invoice } from "@prisma/client";
import { getUsdExchangeRate } from "./exchange";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Obtiene todas las facturas del usuario autenticado
 */
export async function getInvoices() {
    const user = await getAuthUser();
    const clientContext = await getClientContext();

    const where: any = {};
    if (clientContext) {
        where.client_id = clientContext.clientId;
    } else {
        where.client = {
            user_id: user.id,
        };
    }

    const invoices = await prisma.invoices.findMany({
        where,
        include: {
            client: true,
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
    const user = await getAuthUser();
    const clientContext = await getClientContext();

    const where: any = { id };
    if (clientContext) {
        where.client_id = clientContext.clientId;
    } else {
        where.client = {
            user_id: user.id,
        };
    }

    const invoice = await prisma.invoices.findFirst({
        where,
        include: {
            client: true,
            invoice_items: {
                include: {
                    time_entry: {
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
    const user = await getAuthUser();

    return await prisma.time_entries.findMany({
        where: {
            user_id: user.id,
            billable: true,
            is_billed: false,
            ...(clientId && {
                task: {
                    project: {
                        client_id: clientId,
                    },
                },
            }),
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
}

/**
 * Obtiene los IDs de time entries ya facturados
 */
export async function getBilledTimeEntryIds() {
    const user = await getAuthUser();

    const billedItems = await prisma.invoice_items.findMany({
        where: {
            invoice: {
                client: {
                    user_id: user.id,
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
 * Genera el próximo número de factura basado en el tipo
 */
async function generateInvoiceNumber(type: billing_type_invoice = "LEGAL", tx?: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = type === "INTERNAL" ? "INT" : "INV";
    const client = tx || prisma;

    const lastInvoice = await client.invoices.findFirst({
        where: {
            invoice_number: {
                startsWith: `${prefix}-${year}-`,
            },
            billing_type: type,
        },
        orderBy: {
            invoice_number: "desc",
        },
    });

    if (!lastInvoice) {
        return `${prefix}-${year}-001`;
    }

    const lastNumber = parseInt(lastInvoice.invoice_number.split("-")[2] || "0");
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
}): Promise<ActionResponse<invoices>> {
    const user = await getAuthUser();

    // Verificar que el cliente pertenece al usuario
    const client = await prisma.clients.findFirst({
        where: {
            id: data.client_id,
            user_id: user.id,
        },
    });

    if (!client) {
        return {
            success: false,
            error: "Cliente no encontrado.",
        };
    }

    // Obtener los time entries
    const timeEntries = await prisma.time_entries.findMany({
        where: {
            id: {
                in: data.time_entry_ids,
            },
            user_id: user.id,
            billable: true,
            task: {
                project: {
                    client_id: data.client_id,
                },
            },
        },
        include: {
            task: true,
        },
    });

    if (timeEntries.length === 0) {
        return {
            success: false,
            error: "No hay períodos de trabajo válidos para facturar.",
        };
    }

    // Calcular totales basados en moneda y estrategia
    const billingCurrency = data.currency || client.currency;
    const strategy = data.exchange_strategy || "CURRENT";

    let subtotal = 0;
    let currentExchangeRate = 0;

    if (billingCurrency === "ARS") {
        if (strategy === "CURRENT") {
            currentExchangeRate = await getUsdExchangeRate();
            const totalUsd = timeEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
            subtotal = totalUsd * currentExchangeRate;
        } else {
            // Histórico: suma de pesificaciones individuales
            subtotal = timeEntries.reduce((sum, e) => {
                const amountUsd = Number(e.amount || 0);
                const rate = Number(e.usd_exchange_rate || 1050);
                return sum + (amountUsd * rate);
            }, 0);
        }
    } else {
        // USD o moneda base: suma directa
        subtotal = timeEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    }

    const taxRate = data.tax_rate || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    try {
        // Crear factura e items en una transacción
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
                },
            });

            // Crear items de factura
            await Promise.all(
                timeEntries.map((entry) => {
                    let itemAmount = Number(entry.amount || 0);
                    let itemRate = Number(entry.rate_applied || 0);

                    // Si la factura es en ARS, convertir los montos de cada item
                    if (billingCurrency === "ARS") {
                        const rate = strategy === "CURRENT"
                            ? currentExchangeRate
                            : Number(entry.usd_exchange_rate || 1050);
                        itemAmount = itemAmount * rate;
                        itemRate = itemRate * rate;
                    }

                    return tx.invoice_items.create({
                        data: {
                            invoice_id: invoice.id,
                            time_entry_id: entry.id,
                            description: entry.description || entry.task.name || "Trabajo",
                            quantity: (entry.duration_neto || 0) / 60,
                            rate: itemRate,
                            amount: itemAmount,
                            type: "time",
                        },
                    });
                })
            );

            // Marcar time entries como facturados
            await tx.time_entries.updateMany({
                where: {
                    id: { in: data.time_entry_ids }
                },
                data: {
                    is_billed: true
                }
            });

            return invoice;
        });

        revalidatePath("/dashboard/invoices");
        revalidatePath("/dashboard");

        return {
            success: true,
            data: result,
        };
    } catch (error: any) {
        console.error("DEBUG INVOICE CREATION ERROR:", error);
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Error desconocido al crear la factura.",
        };
    }
}

/**
 * Elimina una factura interna y libera las horas asociadas
 */
export async function deleteInvoice(id: string): Promise<ActionResponse<void>> {
    const user = await getAuthUser();

    // 1. Obtener la factura y validar que pertenece al usuario
    const invoice = await prisma.invoices.findFirst({
        where: {
            id,
            client: {
                user_id: user.id,
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

    // 2. Restricción de Seguridad: Inmutable si es LEGAL o tiene CAE
    if (invoice.billing_type === "LEGAL" || invoice.cae) {
        return {
            success: false,
            error: "No se puede eliminar una factura legal o fiscalizada por AFIP. Debe anularse mediante Nota de Crédito."
        };
    }

    try {
        await prisma.$transaction(async (tx) => {
            // A. Obtener los IDs de time_entries vinculados
            const timeEntryIds = invoice.invoice_items
                .map(item => item.time_entry_id)
                .filter((id): id is string => id !== null);

            // B. Liberar las TimeEntries
            if (timeEntryIds.length > 0) {
                await tx.time_entries.updateMany({
                    where: {
                        id: { in: timeEntryIds }
                    },
                    data: {
                        is_billed: false,
                        invoice_id: null
                    }
                });
            }

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
    status: InvoiceStatus
): Promise<ActionResponse<invoices>> {
    const user = await getAuthUser();

    // Verificar que la factura pertenece al usuario
    const existing = await prisma.invoices.findFirst({
        where: {
            id,
            client: {
                user_id: user.id,
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
            status: InvoiceStatus;
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
                client: true,
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
    const user = await getAuthUser();

    const clients = await prisma.clients.findMany({
        where: {
            user_id: user.id,
        },
        include: {
            invoices: true,
        },
    });

    // Obtener todos los time entries facturables
    const allEntries = await prisma.time_entries.findMany({
        where: {
            user_id: user.id,
            billable: true,
            is_billed: false,
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
            (entry) =>
                entry.task.project.client.id === client.id
        );

        const unbilledMinutes = clientUnbilledEntries.reduce(
            (sum, entry) => sum + (entry.duration_neto || 0),
            0
        );
        const unbilledAmount = clientUnbilledEntries.reduce(
            (sum, entry) => sum + Number(entry.amount || 0),
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

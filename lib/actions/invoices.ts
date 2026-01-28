"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import type { invoices, invoice_items, InvoiceStatus } from "@/lib/generated/prisma";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Obtiene todas las facturas del usuario autenticado
 */
export async function getInvoices() {
    const user = await getAuthUser();

    const invoices = await prisma.invoices.findMany({
        where: {
            client: {
                user_id: user.id,
            },
        },
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

    const invoice = await prisma.invoices.findFirst({
        where: {
            id,
            client: {
                user_id: user.id,
            },
        },
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

    // Obtener todos los time entries facturables del usuario
    const allEntries = await prisma.time_entries.findMany({
        where: {
            user_id: user.id,
            billable: true,
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
            invoice_items: {
                select: {
                    id: true,
                },
            },
        },
        orderBy: {
            start_time: "desc",
        },
    });

    // Filtrar solo los que no están facturados (no tienen invoice_items)
    const unbilledEntries = allEntries.filter(
        (entry) => entry.invoice_items.length === 0
    );

    return unbilledEntries;
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
 * Genera el próximo número de factura
 */
async function generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const lastInvoice = await prisma.invoices.findFirst({
        where: {
            invoice_number: {
                startsWith: `INV-${year}-`,
            },
        },
        orderBy: {
            invoice_number: "desc",
        },
    });

    if (!lastInvoice) {
        return `INV-${year}-001`;
    }

    const lastNumber = parseInt(lastInvoice.invoice_number.split("-")[2] || "0");
    const nextNumber = (lastNumber + 1).toString().padStart(3, "0");
    return `INV-${year}-${nextNumber}`;
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

    // Calcular totales
    const subtotal = timeEntries.reduce(
        (sum, entry) => sum + Number(entry.amount || 0),
        0
    );
    const taxRate = data.tax_rate || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    try {
        // Crear factura e items en una transacción
        const result = await prisma.$transaction(async (tx) => {
            // Generar número de factura
            const invoiceNumber = await generateInvoiceNumber();

            // Crear factura
            const invoice = await tx.invoices.create({
                data: {
                    client_id: data.client_id,
                    invoice_number: invoiceNumber,
                    status: "draft",
                    subtotal,
                    tax_rate: taxRate,
                    tax_amount: taxAmount,
                    total_amount: totalAmount,
                    currency: client.currency,
                    due_date: data.due_date || null,
                    notes: data.notes || null,
                },
                include: {
                    client: true,
                },
            });

            // Crear items de factura
            const invoiceItems = await Promise.all(
                timeEntries.map((entry) =>
                    tx.invoice_items.create({
                        data: {
                            invoice_id: invoice.id,
                            time_entry_id: entry.id,
                            description:
                                entry.description || entry.task.name || "Trabajo",
                            quantity: (entry.duration_minutes || 0) / 60,
                            rate: Number(entry.rate_applied || 0),
                            amount: Number(entry.amount || 0),
                            type: "time",
                        },
                    })
                )
            );

            return { invoice, invoiceItems };
        });

        revalidatePath("/dashboard/invoices");
        revalidatePath("/dashboard");

        return {
            success: true,
            data: result.invoice,
        };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Error al crear la factura",
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
            data: updateData,
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

    // Obtener IDs de entries ya facturados
    const billedEntryIds = new Set(
        allEntries
            .filter((entry) => entry.invoice_items.length > 0)
            .map((entry) => entry.id)
    );

    // Calcular resumen por cliente
    const summaries = clients.map((client) => {
        // Entradas sin facturar de este cliente
        const clientUnbilledEntries = allEntries.filter(
            (entry) =>
                entry.task.project.client.id === client.id &&
                !billedEntryIds.has(entry.id)
        );

        const unbilledMinutes = clientUnbilledEntries.reduce(
            (sum, entry) => sum + (entry.duration_minutes || 0),
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

"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Registra un pago para una factura
 */
export async function recordPayment(data: {
    invoice_id: string;
    amount: number;
    payment_date: Date;
    method?: string;
    notes?: string;
}): Promise<ActionResponse<any>> {
    const user = await getAuthUser();

    try {
        // Verificar factura y pertenencia
        const invoice = await prisma.invoices.findFirst({
            where: {
                id: data.invoice_id,
                clients: {
                    user_id: user.id
                }
            },
            include: {
                payments: true
            }
        });

        if (!invoice) return { success: false, error: "Factura no encontrada." };

        const result = await prisma.$transaction(async (tx) => {
            // 1. Crear el pago
            const payment = await tx.payments.create({
                data: {
                    invoice_id: data.invoice_id,
                    amount: data.amount,
                    payment_date: data.payment_date,
                    method: data.method,
                    notes: data.notes,
                }
            });

            // 2. Calcular total pagado (incluyendo este nuevo pago)
            const totalPaid = Number(invoice.payments.reduce((acc, p) => acc + Number(p.amount), 0)) + data.amount;
            const totalInvoice = Number(invoice.total_amount);

            // 3. Determinar nuevo estado
            let newStatus: "paid" | "partial" = "partial";
            if (totalPaid >= totalInvoice) {
                newStatus = "paid";
            }

            // 4. Actualizar factura
            await tx.invoices.update({
                where: { id: data.invoice_id },
                data: {
                    status: newStatus,
                    paid_at: newStatus === "paid" ? data.payment_date : null
                }
            });

            return payment;
        });

        revalidatePath("/dashboard/invoices");
        revalidatePath(`/dashboard/invoices/${data.invoice_id}`);

        return { success: true, data: result };
    } catch (error) {
        console.error("Error recordPayment:", error);
        return { success: false, error: "Error al registrar el pago" };
    }
}

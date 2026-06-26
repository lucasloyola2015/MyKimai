"use server";

import { prisma } from "@/lib/prisma/client";
import { getOwnerContext, canManageWorkspace } from "@/lib/auth/owner-context";
import { revalidatePath } from "next/cache";
import {
    recordPaymentSchema,
    deletePaymentSchema,
} from "@/lib/validations/payments";
import { ZodError } from "zod";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

function zodErrorMessage(err: ZodError): string {
    return err.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ");
}

/**
 * Deriva el estado de cobro de una factura a partir de la suma de sus pagos.
 * SSOT del estado paid/partial. No degrada estados terminales no-cobratorios
 * (draft/sent/cancelled) cuando aún no hay pagos.
 */
function deriveStatusFromPayments(
    totalPaid: number,
    totalInvoice: number,
    currentStatus: string
): { status: string; paid_at: Date | null } {
    if (totalPaid <= 0) {
        // Sin pagos: volver a 'sent' si veníamos de un estado cobratorio,
        // o conservar el estado actual (draft/sent/cancelled/overdue).
        const status =
            currentStatus === "paid" || currentStatus === "partial"
                ? "sent"
                : currentStatus;
        return { status, paid_at: null };
    }
    if (totalPaid >= totalInvoice) {
        return { status: "paid", paid_at: new Date() };
    }
    return { status: "partial", paid_at: null };
}

/**
 * Registra un pago para una factura.
 *
 * §SEC/§Cobranzas — valida el input con zod (monto > 0 y finito), recalcula el
 * total pagado DENTRO de la transacción con un aggregate (no sobre un snapshot
 * stale), y rechaza el sobre-pago (totalPaid > total) para no marcar 'paid' una
 * factura con un monto que excede su total.
 */
export async function recordPayment(data: {
    invoice_id: string;
    amount: number;
    payment_date: Date;
    method?: string;
    notes?: string;
}): Promise<ActionResponse<any>> {
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede registrar pagos.",
        };
    }

    const parsed = recordPaymentSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }
    const input = parsed.data;

    try {
        // Verificar factura y pertenencia al workspace
        const invoice = await prisma.invoices.findFirst({
            where: {
                id: input.invoice_id,
                clients: { user_id: ctx.ownerId },
            },
            select: { id: true, total_amount: true },
        });

        if (!invoice) return { success: false, error: "Factura no encontrada." };

        const totalInvoice = Number(invoice.total_amount);

        const result = await prisma.$transaction(async (tx) => {
            // 1. Total ya pagado ANTES de este pago (dentro de la tx).
            const prior = await tx.payments.aggregate({
                where: { invoice_id: input.invoice_id },
                _sum: { amount: true },
            });
            const priorPaid = Number(prior._sum.amount ?? 0);
            const newTotalPaid = priorPaid + input.amount;

            // 2. Guard de sobre-pago: no permitir cobrar más que el total.
            //    Tolerancia de 1 centavo por redondeo.
            if (newTotalPaid - totalInvoice > 0.01) {
                throw new Error(
                    `El pago excede el saldo pendiente (pagado: ${priorPaid.toFixed(2)}, total: ${totalInvoice.toFixed(2)}).`
                );
            }

            // 3. Crear el pago
            const payment = await tx.payments.create({
                data: {
                    invoice_id: input.invoice_id,
                    amount: input.amount,
                    payment_date: input.payment_date,
                    method: input.method,
                    notes: input.notes,
                },
            });

            // 4. Recalcular estado desde el total real (incluye este pago).
            const { status, paid_at } = deriveStatusFromPayments(
                newTotalPaid,
                totalInvoice,
                "partial"
            );

            await tx.invoices.update({
                where: { id: input.invoice_id },
                data: { status: status as any, paid_at },
            });

            return payment;
        });

        revalidatePath("/dashboard/invoices");
        revalidatePath(`/dashboard/invoices/${input.invoice_id}`);

        return { success: true, data: result };
    } catch (error) {
        console.error("Error recordPayment:", error);
        const msg =
            error instanceof Error && error.message.startsWith("El pago excede")
                ? error.message
                : "Error al registrar el pago";
        return { success: false, error: msg };
    }
}

/**
 * Elimina/anula un pago y recalcula el estado de cobro de la factura dentro de
 * la misma transacción. Sin esto, un pago mal cargado no tenía reversa limpia.
 */
export async function deletePayment(data: {
    payment_id: string;
}): Promise<ActionResponse<{ invoice_id: string }>> {
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede eliminar pagos.",
        };
    }

    const parsed = deletePaymentSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    try {
        // Verificar pertenencia al workspace vía la factura del pago.
        const payment = await prisma.payments.findFirst({
            where: {
                id: parsed.data.payment_id,
                invoices: { clients: { user_id: ctx.ownerId } },
            },
            select: { id: true, invoice_id: true, invoices: { select: { total_amount: true, status: true } } },
        });

        if (!payment) return { success: false, error: "Pago no encontrado." };

        const invoiceId = payment.invoice_id;
        const totalInvoice = Number(payment.invoices.total_amount);

        await prisma.$transaction(async (tx) => {
            await tx.payments.delete({ where: { id: payment.id } });

            const remaining = await tx.payments.aggregate({
                where: { invoice_id: invoiceId },
                _sum: { amount: true },
            });
            const totalPaid = Number(remaining._sum.amount ?? 0);

            const { status, paid_at } = deriveStatusFromPayments(
                totalPaid,
                totalInvoice,
                payment.invoices.status
            );

            await tx.invoices.update({
                where: { id: invoiceId },
                data: { status: status as any, paid_at },
            });
        });

        revalidatePath("/dashboard/invoices");
        revalidatePath(`/dashboard/invoices/${invoiceId}`);

        return { success: true, data: { invoice_id: invoiceId } };
    } catch (error) {
        console.error("Error deletePayment:", error);
        return { success: false, error: "Error al eliminar el pago" };
    }
}

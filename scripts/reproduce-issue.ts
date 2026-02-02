import * as dotenv from "dotenv";
dotenv.config();
import { prisma } from "../lib/prisma/client";

async function reproduce() {
    const data = {
        client_id: '0eb07311-722f-47b8-8ec6-709417faccde',
        time_entry_ids: ['07aa0163-755a-4a6c-a432-160d3a9d764c'],
        tax_rate: 0,
        billing_type: 'INTERNAL' as const,
        currency: 'USD',
        exchange_strategy: 'CURRENT' as const,
    };

    try {
        console.log("Starting reproduction...");

        // 1. Get entries
        const timeEntries = await prisma.time_entries.findMany({
            where: {
                id: { in: data.time_entry_ids },
            },
            include: {
                task: true,
            },
        });

        console.log(`Found ${timeEntries.length} entries`);

        if (timeEntries.length === 0) return;

        const subtotal = timeEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const taxAmount = 0;
        const totalAmount = subtotal;

        // 2. Start transaction
        const result = await prisma.$transaction(async (tx) => {
            console.log("Inside transaction...");

            // Generate number
            const year = new Date().getFullYear();
            const prefix = "INT";
            const lastInvoice = await tx.invoices.findFirst({
                where: {
                    invoice_number: { startsWith: `${prefix}-${year}-` },
                    billing_type: "INTERNAL",
                },
                orderBy: { invoice_number: "desc" },
            });

            let invoiceNumber = `${prefix}-${year}-001`;
            if (lastInvoice) {
                const lastNumber = parseInt(lastInvoice.invoice_number.split("-")[2] || "0");
                invoiceNumber = `${prefix}-${year}-${(lastNumber + 1).toString().padStart(3, "0")}`;
            }

            console.log(`Generated invoice number: ${invoiceNumber}`);

            // Create invoice
            const invoice = await tx.invoices.create({
                data: {
                    client_id: data.client_id,
                    invoice_number: invoiceNumber,
                    status: "draft",
                    billing_type: "INTERNAL",
                    subtotal,
                    tax_rate: 0,
                    tax_amount: 0,
                    total_amount: totalAmount,
                    currency: "USD",
                },
            });

            console.log(`Invoice created with ID: ${invoice.id}`);

            // Create items
            await Promise.all(
                timeEntries.map((entry) =>
                    tx.invoice_items.create({
                        data: {
                            invoice_id: invoice.id,
                            time_entry_id: entry.id,
                            description: entry.description || entry.task.name || "Trabajo",
                            quantity: (entry.duration_minutes || 0) / 60,
                            rate: Number(entry.rate_applied || 0),
                            amount: Number(entry.amount || 0),
                            type: "time",
                        },
                    })
                )
            );

            console.log("Invoice items created");

            // Mark as billed
            await tx.time_entries.updateMany({
                where: { id: { in: data.time_entry_ids } },
                data: { is_billed: true },
            });

            console.log("Time entries marked as billed");

            return invoice;
        });

        console.log("SUCCESS!", result.id);

    } catch (error: any) {
        console.error("FAILURE:", error);
    } finally {
        await prisma.$disconnect();
    }
}

reproduce();


'use server'

import { getAfipClient } from "@/lib/afip";
import { prisma } from "@/lib/prisma/client";
import { revalidatePath } from "next/cache";
import { getUserFiscalSettings } from "@/lib/actions/user-settings";

// Función auxiliar para generar número de nota de crédito
async function generateCreditNoteNumber(tx?: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = "NC";
    const client = tx || prisma;

    const lastCreditNote = await client.invoices.findFirst({
        where: {
            invoice_number: {
                startsWith: `${prefix}-${year}-`,
            },
        },
        orderBy: {
            invoice_number: "desc",
        },
    });

    if (!lastCreditNote) {
        return `${prefix}-${year}-001`;
    }

    const lastNumber = parseInt(lastCreditNote.invoice_number.split("-")[2] || "0");
    const nextNumber = (lastNumber + 1).toString().padStart(3, "0");
    return `${prefix}-${year}-${nextNumber}`;
}

/**
 * Server Action to request a CAE from AFIP for a given invoice.
 * Incorporates logging and business logic for total calculation.
 */
export async function generateFiscalInvoice(invoiceId: string) {
    try {
        const invoice = await prisma.invoices.findUnique({
            where: { id: invoiceId },
            include: {
                clients: true,
                invoice_items: true,
            }
        });

        if (!invoice) throw new Error("Factura no encontrada");
        if (invoice.cae) throw new Error("La factura ya tiene un CAE asignado");
        if (!invoice.clients.tax_id) throw new Error("El cliente no tiene CUIT configurado");

        const issuerSettings = await getUserFiscalSettings();
        const afip = getAfipClient(issuerSettings?.tax_id);

        // Configuración base (Homologación por defecto)
        const { PUNTO_VENTA_DEFAULT } = await import("@/lib/fiscal-config");
        const puntoVenta = invoice.punto_venta ?? PUNTO_VENTA_DEFAULT;
        const cbteTipo = invoice.cbte_tipo || 11; // 11 = Factura C

        // Sincronización oficial del número comercial
        const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, cbteTipo);
        const cbteNro = lastVoucher + 1;

        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0].replace(/-/g, '');

        // Preparar el Payload para AFIP (ARCA)
        const data = {
            CantReg: 1,
            PtoVta: puntoVenta,
            CbteTipo: cbteTipo,
            Concepto: 2, // 2 = Servicios
            DocTipo: 80, // 80 = CUIT
            DocNro: invoice.clients.tax_id.replace(/\D/g, ""),
            CbteDesde: cbteNro,
            CbteHasta: cbteNro,
            CbteFch: formattedDate,
            ImpTotal: Number(invoice.total_amount),
            ImpTotConc: 0,
            ImpNeto: Number(invoice.total_amount),
            ImpOpEx: 0,
            ImpIVA: 0,
            ImpTrib: 0,
            MonId: "PES",
            MonCotiz: 1,
            FchServDesde: formattedDate,
            FchServHasta: formattedDate,
            FchVtoPago: formattedDate,
        };

        console.log("[AFIP] ========== Solicitud CAE (Factura) ==========");
        console.log("[AFIP] invoiceId:", invoiceId, "| PtoVta:", puntoVenta, "| CbteTipo:", cbteTipo, "| CbteNro:", cbteNro);
        console.log("[AFIP] Payload enviado a AFIP/ARCA:", JSON.stringify(data, null, 2));

        // Llamada al Web Service de AFIP
        const res = await afip.ElectronicBilling.createVoucher(data);

        console.log("[AFIP] Respuesta AFIP/ARCA:", JSON.stringify(res, null, 2));
        console.log("[AFIP] ========== Fin solicitud CAE ==========");

        const issuerSettingsForUpdate = await getUserFiscalSettings();

        // Persistencia: CAE + datos para QR AFIP (issuer_tax_id)
        await prisma.invoices.update({
            where: { id: invoiceId },
            data: {
                cae: res.CAE,
                cae_due_date: parseAfipDate(res.CAE_FchVto),
                cbte_nro: cbteNro,
                punto_venta: puntoVenta,
                cbte_tipo: cbteTipo,
                issuer_tax_id: issuerSettingsForUpdate?.tax_id ?? null,
                status: 'sent',
                afip_error: null,
            }
        });

        revalidatePath("/dashboard/invoices");
        revalidatePath(`/dashboard/invoices/${invoiceId}`);

        const result: { success: true; cae: string; cbte_nro: number; _debug?: object } = {
            success: true,
            cae: res.CAE,
            cbte_nro: cbteNro,
        };
        if (process.env.NODE_ENV !== "production") {
            result._debug = { request: data, response: res };
        }
        return result;
    } catch (error: any) {
        // El SDK @afipsdk/afip.js pone status/data en el error, no en error.response
        const status = error.status ?? error.response?.status;
        const responseData = error.data ?? error.response?.data;

        console.error("[AFIP] ERROR en solicitud CAE:", error.message);
        console.error("[AFIP] Status:", status, "| statusText:", error.statusText ?? error.response?.statusText);
        console.error("[AFIP] Response data:", JSON.stringify(responseData, null, 2));

        let errorMessage = error.message || "Error desconocido en el WS de AFIP";
        if (status === 401) {
            errorMessage =
                "AFIP rechazó la autenticación (401). Revisá: 1) Certificado asociado al Web Service wsfe en AFIP. 2) CUIT coincidente con el certificado. 3) Certificado no vencido. 4) Ambiente correcto (producción vs homologación).";
        }
        if (responseData && typeof responseData === "object" && (responseData.Mensaje ?? responseData.message)) {
            errorMessage += ` [AFIP: ${responseData.Mensaje ?? responseData.message}]`;
        }

        await prisma.invoices.update({
            where: { id: invoiceId },
            data: {
                afip_error: `[${new Date().toISOString()}] ${errorMessage}`,
                status: "draft",
            },
        });

        const failResult: { success: false; error: string; _debug?: object } = {
            success: false,
            error: errorMessage,
        };
        if (process.env.NODE_ENV !== "production") {
            failResult._debug = {
                status: status ?? null,
                statusText: error.statusText ?? null,
                responseData: responseData ?? null,
                errorMessage: error.message,
            };
        }
        return failResult;
    }
}

/**
 * Server Action para generar una Nota de Crédito que anula una factura emitida.
 * Tipo de comprobante: 3 = Nota de Crédito C (para Monotributistas)
 */
export async function generateCreditNote(originalInvoiceId: string) {
    try {
        const originalInvoice = await prisma.invoices.findUnique({
            where: { id: originalInvoiceId },
            include: {
                clients: true,
                invoice_items: true,
            }
        });

        if (!originalInvoice) throw new Error("Factura original no encontrada");
        if (!originalInvoice.cae) throw new Error("La factura original no tiene CAE. Solo se pueden anular facturas emitidas.");
        if (!originalInvoice.clients.tax_id) throw new Error("El cliente no tiene CUIT configurado");
        if (originalInvoice.billing_type !== "LEGAL") throw new Error("Solo se pueden anular facturas legales (AFIP)");

        const issuerSettings = await getUserFiscalSettings();
        const afip = getAfipClient(issuerSettings?.tax_id);

        const { PUNTO_VENTA_DEFAULT } = await import("@/lib/fiscal-config");
        const puntoVenta = originalInvoice.punto_venta ?? PUNTO_VENTA_DEFAULT;
        const cbteTipo = 3; // 3 = Nota de Crédito C

        // Obtener último número de Nota de Crédito
        const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, cbteTipo);
        const cbteNro = lastVoucher + 1;

        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0].replace(/-/g, '');

        // Preparar el Payload para Nota de Crédito
        const data = {
            'CantReg': 1,
            'PtoVta': puntoVenta,
            'CbteTipo': cbteTipo,
            'Concepto': 2, // 2 = Servicios
            'DocTipo': 80, // 80 = CUIT
            'DocNro': originalInvoice.clients.tax_id.replace(/\D/g, ''),
            'CbteDesde': cbteNro,
            'CbteHasta': cbteNro,
            'CbteFch': formattedDate,
            'ImpTotal': Number(originalInvoice.total_amount), // Mismo monto que la factura original
            'ImpTotConc': 0,
            'ImpNeto': Number(originalInvoice.total_amount),
            'ImpOpEx': 0,
            'ImpIVA': 0,
            'ImpTrib': 0,
            'MonId': 'PES',
            'MonCotiz': 1,
            'FchServDesde': formattedDate,
            'FchServHasta': formattedDate,
            'FchVtoPago': formattedDate,
            // Referencia a la factura original
            'CbteAsoc': [
                {
                    'Tipo': originalInvoice.cbte_tipo || 11,
                    'PtoVta': puntoVenta,
                    'Nro': originalInvoice.cbte_nro || 0,
                }
            ],
        };

        console.log("[AFIP] ========== Solicitud CAE (Nota de Crédito) ==========");
        console.log("[AFIP] Factura original:", originalInvoiceId, "| PtoVta:", puntoVenta, "| CbteNro NC:", cbteNro);
        console.log("[AFIP] Payload Nota de Crédito:", JSON.stringify(data, null, 2));

        // Llamada al Web Service de AFIP
        const res = await afip.ElectronicBilling.createVoucher(data);

        console.log("[AFIP] Respuesta AFIP/ARCA (NC):", JSON.stringify(res, null, 2));
        console.log("[AFIP] ========== Fin solicitud CAE NC ==========");

        // Generar número de nota de crédito
        const creditNoteNumber = await generateCreditNoteNumber();

        // Crear la Nota de Crédito como nueva factura con estado 'sent'
        const creditNote = await prisma.invoices.create({
            data: {
                client_id: originalInvoice.client_id,
                invoice_number: creditNoteNumber,
                status: 'sent',
                billing_type: 'LEGAL',
                subtotal: originalInvoice.subtotal,
                tax_rate: originalInvoice.tax_rate,
                tax_amount: originalInvoice.tax_amount,
                total_amount: originalInvoice.total_amount, // Mismo monto
                currency: originalInvoice.currency,
                issue_date: today,
                notes: `Nota de Crédito que anula la factura ${originalInvoice.invoice_number}`,
                cae: res.CAE,
                cae_due_date: parseAfipDate(res.CAE_FchVto),
                cbte_nro: cbteNro,
                punto_venta: puntoVenta,
                cbte_tipo: cbteTipo,
            },
        });

        // Marcar la factura original como anulada
        await prisma.invoices.update({
            where: { id: originalInvoiceId },
            data: {
                status: 'cancelled',
            }
        });

        revalidatePath('/dashboard/invoices');
        revalidatePath(`/dashboard/invoices/${originalInvoiceId}`);

        return {
            success: true,
            cae: res.CAE,
            cbte_nro: cbteNro,
            credit_note_id: creditNote.id
        };

    } catch (error: any) {
        console.error("DEBUG AFIP CREDIT NOTE ERROR:", error);
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            response: error.response?.data
        });

        const errorMessage = error.message || "Error desconocido al generar Nota de Crédito";

        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Parser de fecha AFIP (YYYYMMDD -> Date)
 */
function parseAfipDate(dateStr: string): Date {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    return new Date(year, month, day);
}

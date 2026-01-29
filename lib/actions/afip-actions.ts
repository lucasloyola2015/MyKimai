
'use server'

import { getAfipClient } from "@/lib/afip";
import { prisma } from "@/lib/prisma/client";
import { revalidatePath } from "next/cache";

/**
 * Server Action to request a CAE from AFIP for a given invoice.
 * Incorporates logging and business logic for total calculation.
 */
export async function generateFiscalInvoice(invoiceId: string) {
    try {
        const invoice = await prisma.invoices.findUnique({
            where: { id: invoiceId },
            include: {
                client: true,
                invoice_items: true,
            }
        });

        if (!invoice) throw new Error("Factura no encontrada");
        if (invoice.cae) throw new Error("La factura ya tiene un CAE asignado");
        if (!invoice.client.tax_id) throw new Error("El cliente no tiene CUIT configurado");

        const afip = getAfipClient();

        // Configuración base (Homologación por defecto)
        const puntoVenta = invoice.punto_venta || 1;
        const cbteTipo = invoice.cbte_tipo || 11; // 11 = Factura C

        // Sincronización oficial del número comercial
        const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, cbteTipo);
        const cbteNro = lastVoucher + 1;

        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0].replace(/-/g, '');

        // Preparar el Payload para AFIP (ARCA)
        const data = {
            'CantReg': 1,
            'PtoVta': puntoVenta,
            'CbteTipo': cbteTipo,
            'Concepto': 2, // 2 = Servicios
            'DocTipo': 80, // 80 = CUIT
            'DocNro': invoice.client.tax_id.replace(/\D/g, ''),
            'CbteDesde': cbteNro,
            'CbteHasta': cbteNro,
            'CbteFch': formattedDate,
            'ImpTotal': Number(invoice.total_amount),
            'ImpTotConc': 0,
            'ImpNeto': Number(invoice.total_amount),
            'ImpOpEx': 0,
            'ImpIVA': 0,
            'ImpTrib': 0,
            'MonId': 'PES',
            'MonCotiz': 1,
            'FchServDesde': formattedDate,
            'FchServHasta': formattedDate,
            'FchVtoPago': formattedDate,
        };

        console.log(`[AFIP] Solicitando CAE para Factura ${invoiceId} - Número ${cbteNro}`);

        // Llamada al Web Service de AFIP
        const res = await afip.ElectronicBilling.createVoucher(data);

        // Persistencia de éxito profesional
        await prisma.invoices.update({
            where: { id: invoiceId },
            data: {
                cae: res.CAE,
                cae_due_date: parseAfipDate(res.CAE_FchVto),
                cbte_nro: cbteNro,
                punto_venta: puntoVenta,
                cbte_tipo: cbteTipo,
                status: 'sent',
                afip_error: null, // Limpiamos errores previos si los hubiera
            }
        });

        revalidatePath('/dashboard/invoices');
        revalidatePath(`/dashboard/invoices/${invoiceId}`);

        return {
            success: true,
            cae: res.CAE,
            cbte_nro: cbteNro
        };

    } catch (error: any) {
        console.error("[AFIP ERROR]", error);

        const errorMessage = error.message || "Error desconocido en el WS de AFIP";

        // Registrar el LOG de error en la tabla invoices para el usuario
        await prisma.invoices.update({
            where: { id: invoiceId },
            data: {
                afip_error: `[${new Date().toISOString()}] ${errorMessage}`,
                status: 'draft'
            }
        });

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

import * as dotenv from 'dotenv';
import * as path from 'path';

// Cargar variables de entorno PRIMERO
const envLocal = dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const env = dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log("Environment loaded:", {
    local: envLocal.error ? 'Error' : 'OK',
    env: env.error ? 'Error' : 'OK',
    DB_URL_PRESENT: !!process.env.DATABASE_URL
});

async function updateInvoice() {
    // Importación dinámica para asegurar que las variables de entorno estén cargadas
    const { prisma } = await import('../lib/prisma/client');

    const invoiceId = 'INT-2026-001'; // ID interno actual

    // DATOS A COMPLETAR MANUALMENTE (Extraer del PDF)
    const REAL_CAE = "______________"; // <--- COMPLETAR AQUÍ (14 dígitos)
    const REAL_CAE_VTO = "YYYY-MM-DD"; // <--- COMPLETAR AQUÍ (Fecha Vencimiento CAE)
    const REAL_FECHA_EMISION = "YYYY-MM-DD"; // <--- COMPLETAR AQUÍ (Fecha Emisión Factura)

    // DATOS OBTENIDOS DEL NOMBRE DE ARCHIVO
    const PTO_VTA = 2;
    const CBTE_TYPE = 11; // Factura C (Monotributo)
    const CBTE_NRO = 18;
    const NEW_INVOICE_NUMBER = "00002-00000018";

    console.log(`Intentando actualizar factura ${invoiceId}...`);

    if (REAL_CAE === "______________") {
        console.error("❌ ERROR: Debes editar el script y completar REAL_CAE, REAL_CAE_VTO y REAL_FECHA_EMISION con los datos del PDF.");
        // Validamos que prisma funcione antes de salir
        try {
            const count = await prisma.invoices.count();
            console.log(`Conexión DB OK. Facturas en sistema: ${count}`);
        } catch (e) {
            console.error("Error conectando a DB:", e);
        }
        process.exit(1);
    }

    try {
        // Buscar la factura draft
        const invoice = await prisma.invoices.findFirst({
            where: { invoice_number: invoiceId }
        });

        if (!invoice) {
            console.error(`❌ Factura ${invoiceId} no encontrada.`);
            return;
        }

        // Actualizar datos
        const updated = await prisma.invoices.update({
            where: { id: invoice.id },
            data: {
                punto_venta: PTO_VTA,
                cbte_tipo: CBTE_TYPE,
                cbte_nro: CBTE_NRO,
                invoice_number: NEW_INVOICE_NUMBER,
                cae: REAL_CAE,
                cae_due_date: new Date(REAL_CAE_VTO),
                issue_date: new Date(REAL_FECHA_EMISION),
                status: 'sent', // Ya fue emitida en AFIP
                afip_error: null, // Limpiar errores previos
            }
        });

        console.log("✅ FACTURA ACTUALIZADA VINCULADA CORRECTAMENTE:");
        console.log(updated);

    } catch (error) {
        console.error("Error actualizando factura:", error);
    } finally {
        await prisma.$disconnect();
    }
}

updateInvoice();

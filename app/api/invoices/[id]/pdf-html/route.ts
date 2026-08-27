import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getInvoiceWithItems } from "@/lib/actions/invoices";
import { getUserFiscalSettings } from "@/lib/actions/user-settings";
import { fillInvoiceTemplate, invoiceToTemplateData } from "@/lib/invoice-template";
import { prisma } from "@/lib/prisma/client";

/**
 * GET /api/invoices/[id]/pdf-html
 * Devuelve el HTML de la factura rellenado con la plantilla (para generar PDF en cliente).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [invoice, issuer] = await Promise.all([
      getInvoiceWithItems(id),
      getUserFiscalSettings(),
    ]);
    if (!invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }
    // Time entries vinculados: se usan para el período real y para el ANEXO de
    // detalle que se adjunta después de la factura.
    const linkedEntries = await prisma.time_entries.findMany({
      where: { invoice_id: id },
      select: {
        start_time: true,
        end_time: true,
        description: true,
        title: true,
        duration_neto: true,
        billable: true,
        tasks: {
          select: { name: true, projects: { select: { name: true } } },
        },
      },
      orderBy: { start_time: "asc" },
    });
    const periodStart = linkedEntries.length > 0 ? linkedEntries[0].start_time : null;
    // §PDF — el "Hasta" es el máximo end_time (o start_time si la entrada no
    // tiene fin), NO el start_time de la última entrada: una sesión que cruza
    // medianoche tiene su fin en un día posterior a su inicio.
    const periodEnd =
      linkedEntries.length > 0
        ? linkedEntries.reduce<Date>((max, e) => {
            const end = e.end_time ?? e.start_time;
            return end > max ? end : max;
          }, linkedEntries[0].end_time ?? linkedEntries[0].start_time)
        : null;

    const templatePath = path.join(process.cwd(), "public", "templates", "invoice.html");
    const templateHtml = fs.readFileSync(templatePath, "utf8");
    const data = invoiceToTemplateData(
      { ...(invoice as any), _periodStart: periodStart, _periodEnd: periodEnd },
      issuer
    );
    const html = fillInvoiceTemplate(templateHtml, data, linkedEntries as any);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err: any) {
    if (err?.message === "Unauthorized") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    console.error("[pdf-html]", err);
    return NextResponse.json(
      { error: err?.message ?? "Error al generar el HTML de la factura" },
      { status: 500 }
    );
  }
}

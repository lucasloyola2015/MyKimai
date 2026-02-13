import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getInvoiceWithItems } from "@/lib/actions/invoices";
import { getUserFiscalSettings } from "@/lib/actions/user-settings";
import { fillInvoiceTemplate, invoiceToTemplateData } from "@/lib/invoice-template";

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
    const templatePath = path.join(process.cwd(), "public", "templates", "invoice.html");
    const templateHtml = fs.readFileSync(templatePath, "utf8");
    const data = invoiceToTemplateData(invoice as any, issuer);
    const html = fillInvoiceTemplate(templateHtml, data);
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

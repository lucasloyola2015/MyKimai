"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface InvoiceWithDetails {
  id: string;
  invoice_number: string;
  issue_date: Date | string;
  due_date?: Date | string | null;
  currency?: string | null;
  subtotal?: number | string;
  tax_amount?: number | string | null;
  total_amount: number | string;
  cae?: string | null;
  cae_due_date?: Date | string | null;
  issuer_tax_id?: string | null;
  punto_venta?: number | null;
  cbte_nro?: number | null;
  invoice_items: Array<{ id: string; description: string | null; quantity: number | string; rate: number | string; amount: number | string; type: string }>;
  clients: { name: string; email?: string | null; address?: string | null; tax_id?: string | null };
}

/**
 * Enlace de descarga del PDF de la factura.
 * Obtiene el HTML desde la API (plantilla rellenada) y lo convierte a PDF en el cliente con html2pdf.js.
 */
export function InvoicePDFDownloadLink({ invoice }: { invoice: InvoiceWithDetails }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    let container: HTMLDivElement | null = null;
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf-html`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(res.status === 401 ? "No autorizado" : text || "Error al obtener la factura");
      }
      const html = await res.text();
      container = document.createElement("div");
      container.innerHTML = html;
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "210mm";
      document.body.appendChild(container);

      // Esperar a que fuentes e imágenes externas carguen (QR)
      await new Promise((r) => setTimeout(r, 800));

      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 0,
          filename: `${invoice.invoice_number}.pdf`,
          image: { type: "jpeg", quality: 1 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        } as any)
        .from(container)
        .save();
    } catch (err: any) {
      console.error("[InvoicePDFDownloadLink]", err);
      toast({
        title: "Error al generar el PDF",
        description: err?.message ?? "Vuelve a intentarlo.",
        variant: "destructive",
      });
    } finally {
      if (container?.parentNode) {
        document.body.removeChild(container);
      }
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-primary"
      aria-label="Descargar PDF"
      disabled={loading}
      onClick={handleDownload}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
    </Button>
  );
}

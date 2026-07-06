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
 * Botón de descarga/impresión del PDF de la factura.
 * Abre el HTML renderizado en una ventana nueva y lanza el diálogo de impresión
 * del navegador, que permite guardar como PDF con renderizado nativo perfecto.
 */
export function InvoicePDFDownloadLink({ invoice }: { invoice: InvoiceWithDetails }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf-html`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(res.status === 401 ? "No autorizado" : text || "Error al obtener la factura");
      }
      const html = await res.text();

      // Abrir ventana nueva con el HTML y lanzar impresión nativa
      const printWindow = window.open("", "_blank", "width=800,height=1100");
      if (!printWindow) {
        throw new Error("El navegador bloqueó la ventana emergente. Permitir pop-ups para este sitio.");
      }

      // El print se dispara UNA sola vez desde DENTRO del propio documento (con su
      // propio flag), no desde la ventana padre. Antes había un print() en onload
      // + un fallback a los 2s que podían disparar dos diálogos.
      const printScript = `<script>(function(){var p=false;function go(){if(p)return;p=true;try{window.focus();}catch(e){}window.print();}if(document.readyState==='complete'){setTimeout(go,300);}else{window.addEventListener('load',function(){setTimeout(go,300);});}setTimeout(go,1500);})();</script>`;
      const htmlWithPrint = html.includes("</body>")
        ? html.replace("</body>", `${printScript}</body>`)
        : html + printScript;

      printWindow.document.open();
      printWindow.document.write(htmlWithPrint);
      printWindow.document.close();

    } catch (err: any) {
      console.error("[InvoicePDFDownloadLink]", err);
      toast({
        title: "Error al generar el PDF",
        description: err?.message ?? "Vuelve a intentarlo.",
        variant: "destructive",
      });
    } finally {
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

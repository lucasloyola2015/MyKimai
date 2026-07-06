"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileBarChart, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getInvoiceReportData } from "@/lib/actions/reports";
import { arDayKey } from "@/lib/timezone";

/**
 * Botón (por fila del listado de facturas) que descarga el INFORME DETALLADO
 * —resumen por proyecto + detalle de tareas— de las horas incluidas en esa
 * factura. Genera el PDF en el cliente al hacer click; @react-pdf se importa de
 * forma diferida para no inflar el bundle del listado.
 */
export function InvoiceReportButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const data = await getInvoiceReportData(invoiceId);
      if (!data || data.entries.length === 0) {
        toast({
          title: "Sin registros",
          description: "Esta factura no tiene horas asociadas para el informe.",
        });
        return;
      }

      const projMap: Record<string, number> = {};
      const dayMap: Record<string, number> = {};
      let totalMin = 0;
      for (const e of data.entries as any[]) {
        if (e.billable === false) continue;
        const min = e.duration_neto || 0;
        totalMin += min;
        const pn = e.tasks?.projects?.name ?? "—";
        projMap[pn] = (projMap[pn] || 0) + min;
        const dk = arDayKey(e.start_time);
        dayMap[dk] = (dayMap[dk] || 0) + min;
      }

      const analytics = {
        projects: Object.entries(projMap).map(([name, m]) => ({
          name,
          hours: Number((m / 60).toFixed(2)),
        })),
        daily: Object.entries(dayMap)
          .map(([date, m]) => ({ date, hours: Number((m / 60).toFixed(2)) }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };

      // Import diferido de @react-pdf + PDFReport (pesados) recién al descargar.
      const [{ pdf }, { PDFReport }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/reports/PDFReport"),
      ]);
      const blob = await pdf(
        <PDFReport
          entries={data.entries as any}
          client={data.invoice.clients as any}
          totalHours={(totalMin / 60).toFixed(2)}
          analytics={analytics}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Informe_${data.invoice.invoice_number || invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[InvoiceReportButton]", err);
      toast({
        title: "Error al generar el informe",
        description: "Volvé a intentarlo.",
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
      title="Descargar informe detallado (PDF)"
      aria-label="Descargar informe detallado"
      disabled={loading}
      onClick={handleDownload}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileBarChart className="h-4 w-4" />
      )}
    </Button>
  );
}

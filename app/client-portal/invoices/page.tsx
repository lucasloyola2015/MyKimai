"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, AlertCircle, Clock, FolderKanban } from "lucide-react";
import { format } from "date-fns";
import { InvoicePDFDownloadLink } from "@/components/invoices/invoice-pdf-download-link";
import { getInvoices } from "@/lib/actions/invoices";
import { getPortalUnbilledSummary } from "@/lib/actions/portal";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const INVOICE_STATUS_CONFIG: Record<string, { label: string; variant: "active" | "paused" | "completed" | "cancelled" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "cancelled" },
  sent: { label: "Enviada", variant: "completed" },
  paid: { label: "Pagada", variant: "active" },
  overdue: { label: "Vencida", variant: "destructive" },
};

export default function ClientInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [unbilled, setUnbilled] = useState<{ projectId: string; projectName: string; totalHours: number; totalAmount: number; currency: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invoicesData, unbilledData] = await Promise.all([
        getInvoices(),
        getPortalUnbilledSummary(),
      ]);
      setInvoices(invoicesData || []);
      setUnbilled(unbilledData || []);
    } catch (err) {
      console.error("Error loading data:", err);
      setError("No se pudieron cargar los datos. Por favor, intenta de nuevo más tarde.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <Skeleton className="h-8 w-48 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-widest text-[10px]">Proyecto</th>
                <th className="text-right py-2 px-3 font-semibold text-muted-foreground uppercase tracking-widest text-[10px]">Horas</th>
                <th className="text-right py-2 px-3 font-semibold text-muted-foreground uppercase tracking-widest text-[10px]">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[1, 2, 3].map((i) => (
                <tr key={i}>
                  <td className="py-2 px-3"><Skeleton className="h-4 w-28" /></td>
                  <td className="py-2 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                  <td className="py-2 px-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-widest text-[10px]">Comprobante</th>
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-widest text-[10px]">Emisión</th>
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-widest text-[10px]">Estado</th>
                <th className="text-right py-2 px-3 font-semibold text-muted-foreground uppercase tracking-widest text-[10px]">Monto</th>
                <th className="w-10 py-2 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {[1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td className="py-2 px-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="py-2 px-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="py-2 px-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  <td className="py-2 px-3 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
                  <td className="py-2 px-3" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-xl font-bold">Error de vinculación</h2>
        <p className="text-muted-foreground text-sm mt-1 max-w-md">{error}</p>
        <Button onClick={loadData} variant="outline" size="sm" className="mt-4">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Facturación</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Horas pendientes de facturar y historial de comprobantes emitidos.
        </p>
      </div>

      {/* Horas no facturadas: tabla compacta (valor en moneda del proyecto) */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Horas no facturadas
        </h2>
        <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto -mx-px" style={{ WebkitOverflowScrolling: "touch" }}>
          <table className="w-full text-sm min-w-[320px]">
            <thead>
              <tr className="bg-muted/40 border-b text-muted-foreground">
                <th className="text-left py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Proyecto</th>
                <th className="text-right py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Horas netas</th>
                <th className="text-right py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Monto pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {unbilled.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 px-3 text-center text-muted-foreground text-sm">
                    No hay horas pendientes de facturar.
                  </td>
                </tr>
              ) : (
                unbilled.map((row) => (
                  <tr key={row.projectId} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-3 flex items-center gap-2">
                      <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{row.projectName}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground">
                      {row.totalHours.toFixed(2)}h
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                      {row.currency} {Number(row.totalAmount).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Facturas realizadas: tabla compacta — Nº Comprobante, Fecha, Estado, Monto (moneda emitida), Acción */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Facturas realizadas
        </h2>
        <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto -mx-px" style={{ WebkitOverflowScrolling: "touch" }}>
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="bg-muted/40 border-b text-muted-foreground">
                <th className="text-left py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Comprobante</th>
                <th className="text-left py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Emisión</th>
                <th className="text-left py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Estado</th>
                <th className="text-right py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Monto</th>
                <th className="w-10 py-2 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 px-3 text-center text-muted-foreground text-sm">
                    No hay facturas emitidas.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const statusConfig = INVOICE_STATUS_CONFIG[invoice.status] ?? { label: invoice.status, variant: "outline" as const };
                  const amount = Number(invoice.total_amount);
                  const currency = invoice.currency ?? "USD";
                  return (
                    <tr key={invoice.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="py-2 px-3">
                        <span className="font-mono font-medium text-foreground">{invoice.invoice_number}</span>
                        {invoice.cae && (
                          <span className="block text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                            CAE: {invoice.cae}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {format(new Date(invoice.issue_date), "dd/MM/yy")}
                      </td>
                      <td className="py-2 px-3">
                        <Badge size="sm" variant={statusConfig.variant} className="font-mono text-[10px] uppercase">
                          {statusConfig.label}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                        {currency} {amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3">
                        <InvoicePDFDownloadLink invoice={invoice} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {invoices.length === 0 && unbilled.length === 0 && (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Sin registros</p>
          <p className="text-muted-foreground text-xs mt-1">
            Aún no hay horas facturadas ni facturas emitidas para tu cuenta.
          </p>
        </div>
      )}
    </div>
  );
}

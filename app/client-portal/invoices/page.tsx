"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { getInvoices } from "@/lib/actions/invoices";
import { Skeleton } from "@/components/ui/skeleton";

const INVOICE_STATUSES = [
  { value: "draft", label: "Borrador", color: "bg-gray-100 text-gray-800" },
  { value: "sent", label: "Enviada", color: "bg-blue-100 text-blue-800" },
  { value: "paid", label: "Pagada", color: "bg-green-100 text-green-800" },
  { value: "overdue", label: "Vencida", color: "bg-red-100 text-red-800" },
];

export default function ClientInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const data = await getInvoices();
      setInvoices(data || []);
    } catch (err) {
      console.error("Error loading invoices:", err);
      setError("No se pudieron cargar las facturas. Por favor, intenta de nuevo más tarde.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex items-center space-x-4">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-10 w-32" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold">Error de vinculación</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          {error}
        </p>
        <Button onClick={loadInvoices} variant="outline" className="mt-6">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mis Facturas</h1>
        <p className="text-muted-foreground">
          Visualiza y descarga tus facturas
        </p>
      </div>

      <div className="grid gap-4">
        {invoices.map((invoice) => {
          const statusInfo = INVOICE_STATUSES.find(
            (s) => s.value === invoice.status
          );
          return (
            <Card key={invoice.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-primary/70" />
                      <span>{invoice.invoice_number}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase font-bold ${statusInfo?.color}`}
                      >
                        {statusInfo?.label}
                      </span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Emitida: {format(new Date(invoice.issue_date), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end space-x-4">
                    <span className="text-xl font-bold">
                      {invoice.currency} {Number(invoice.total_amount).toLocaleString()}
                    </span>
                    {invoice && (
                      <PDFDownloadLink
                        document={<InvoicePDF invoice={invoice as any} />}
                        fileName={`${invoice.invoice_number}.pdf`}
                        className="inline-block"
                      >
                        <Button variant="outline" size="sm">
                          <Download className="mr-2 h-4 w-4" />
                          Descargar
                        </Button>
                      </PDFDownloadLink>
                    )}
                  </div>
                </div>
              </CardHeader>
              {invoice.due_date && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    Vencimiento: {format(new Date(invoice.due_date), "dd/MM/yyyy")}
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {invoices.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed rounded-xl">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h2 className="text-xl font-semibold">No hay registros para mostrar</h2>
          <p className="text-muted-foreground mt-1">
            Aún no se han generado facturas para tu cuenta.
          </p>
        </div>
      )}
    </div>
  );
}

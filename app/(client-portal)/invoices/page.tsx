"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { Database } from "@/lib/types/database";
import { format } from "date-fns";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";
import { PDFDownloadLink } from "@react-pdf/renderer";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];

interface InvoiceWithClient extends Invoice {
  clients: Client;
}

const INVOICE_STATUSES = [
  { value: "draft", label: "Borrador", color: "bg-gray-100 text-gray-800" },
  { value: "sent", label: "Enviada", color: "bg-blue-100 text-blue-800" },
  { value: "paid", label: "Pagada", color: "bg-green-100 text-green-800" },
  { value: "overdue", label: "Vencida", color: "bg-red-100 text-red-800" },
];

export default function ClientInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Get client user relationship
      const { data: clientUser } = await supabase
        .from("client_users")
        .select("client_id")
        .eq("user_id", user.id)
        .single();

      if (!clientUser) {
        setLoading(false);
        return;
      }

      // Get invoices for this client
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("*, clients(*)")
        .eq("client_id", clientUser.client_id)
        .order("created_at", { ascending: false });

      if (invoicesError) throw invoicesError;
      setInvoices((invoicesData as any) || []);
    } catch (error) {
      console.error("Error loading invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Cargando...</div>;
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
            <Card key={invoice.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <span>{invoice.invoice_number}</span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${statusInfo?.color}`}
                      >
                        {statusInfo?.label}
                      </span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(invoice.issue_date), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl font-bold">
                      {invoice.total_amount.toFixed(2)} {invoice.currency}
                    </span>
                    {invoice && (
                      <PDFDownloadLink
                        document={<InvoicePDF invoice={invoice as any} />}
                        fileName={`${invoice.invoice_number}.pdf`}
                      >
                        {({ loading }) => (
                          <Button disabled={loading} variant="outline">
                            <Download className="mr-2 h-4 w-4" />
                            {loading ? "Generando..." : "Descargar"}
                          </Button>
                        )}
                      </PDFDownloadLink>
                    )}
                  </div>
                </div>
              </CardHeader>
              {invoice.due_date && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Vence: {format(new Date(invoice.due_date), "dd/MM/yyyy")}
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {invoices.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No hay facturas disponibles.</p>
        </div>
      )}
    </div>
  );
}

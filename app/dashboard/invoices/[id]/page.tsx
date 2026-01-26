"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Send } from "lucide-react";
import type { Database } from "@/lib/types/database";
import { format } from "date-fns";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";
import { PDFDownloadLink } from "@react-pdf/renderer";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceItem = Database["public"]["Tables"]["invoice_items"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];

interface InvoiceWithDetails extends Invoice {
  clients: Client;
  invoice_items: InvoiceItem[];
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, clients(*), invoice_items(*)")
        .eq("id", invoiceId)
        .single();

      if (error) throw error;
      setInvoice(data as InvoiceWithDetails);
    } catch (error) {
      console.error("Error loading invoice:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    // TODO: Implement email sending
    alert("Funcionalidad de envío por email próximamente");
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  if (!invoice) {
    return <div>Factura no encontrada</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{invoice.invoice_number}</h1>
          <p className="text-muted-foreground">
            {invoice.clients.name} -{" "}
            {format(new Date(invoice.issue_date), "dd/MM/yyyy")}
          </p>
        </div>
        <div className="flex space-x-2">
          {invoice && (
            <PDFDownloadLink
              document={<InvoicePDF invoice={invoice} />}
              fileName={`${invoice.invoice_number}.pdf`}
            >
              <Button>
                <Download className="mr-2 h-4 w-4" />
                Descargar PDF
              </Button>
            </PDFDownloadLink>
          )}
          <Button onClick={handleSend} variant="outline">
            <Send className="mr-2 h-4 w-4" />
            Enviar por Email
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalles de la Factura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Cliente</p>
              <p className="font-medium">{invoice.clients.name}</p>
              {invoice.clients.email && (
                <p className="text-sm text-muted-foreground">
                  {invoice.clients.email}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estado</p>
              <p className="font-medium">{invoice.status}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">Items</h3>
            <div className="space-y-2">
              {invoice.invoice_items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center py-2 border-b"
                >
                  <div>
                    <p className="font-medium">{item.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} {item.type === "time" ? "horas" : "unidades"} ×{" "}
                      {item.rate.toFixed(2)} {invoice.currency}
                    </p>
                  </div>
                  <p className="font-medium">
                    {item.amount.toFixed(2)} {invoice.currency}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>
                {invoice.subtotal.toFixed(2)} {invoice.currency}
              </span>
            </div>
            {invoice.tax_rate && invoice.tax_rate > 0 && (
              <div className="flex justify-between">
                <span>Impuesto ({invoice.tax_rate}%):</span>
                <span>
                  {invoice.tax_amount?.toFixed(2)} {invoice.currency}
                </span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total:</span>
              <span>
                {invoice.total_amount.toFixed(2)} {invoice.currency}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, FileText, Download, Send, Check } from "lucide-react";
import type { Database } from "@/lib/types/database";
import { format } from "date-fns";
import Link from "next/link";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

interface InvoiceWithClient extends Invoice {
  clients: Client;
}

const INVOICE_STATUSES = [
  { value: "draft", label: "Borrador", color: "bg-gray-100 text-gray-800" },
  { value: "sent", label: "Enviada", color: "bg-blue-100 text-blue-800" },
  { value: "paid", label: "Pagada", color: "bg-green-100 text-green-800" },
  { value: "overdue", label: "Vencida", color: "bg-red-100 text-red-800" },
];

interface ClientSummary {
  clientId: string;
  clientName: string;
  currency: string;
  unbilledHours: number; // minutos
  unbilledAmount: number;
  billedUnpaidAmount: number;
  billedPaidAmount: number;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [clientSummaries, setClientSummaries] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const supabase = createClientComponentClient();

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, "0")}`;
  };

  const [formData, setFormData] = useState({
    client_id: "",
    tax_rate: "0",
    due_date: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Load clients
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("name");

      if (clientsError) throw clientsError;
      setClients(clientsData || []);

      // Load invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("*, clients(*)")
        .eq("clients.user_id", user.id)
        .order("created_at", { ascending: false });

      if (invoicesError) throw invoicesError;
      setInvoices((invoicesData as any) || []);

      // Load all time entries
      const { data: allEntries, error: entriesError } = await supabase
        .from("time_entries")
        .select("*, tasks(name, projects(name, clients(name)))")
        .eq("user_id", user.id)
        .eq("billable", true)
        .order("start_time", { ascending: false });

      // Get billed entry IDs
      const { data: billedItems } = await supabase
        .from("invoice_items")
        .select("time_entry_id");

      const billedEntryIds = new Set(
        (billedItems || [])
          .map((item) => item.time_entry_id)
          .filter((id): id is string => Boolean(id))
      );

      // Filter out billed entries
      const entriesData = (allEntries || []).filter(
        (entry) => !billedEntryIds.has(entry.id)
      );

      if (entriesError) throw entriesError;
      setTimeEntries((entriesData as any) || []);

      // Calculate client summaries
      const summaries: ClientSummary[] = clientsData.map((client) => {
        // Unbilled time entries for this client
        const clientUnbilledEntries = (entriesData as any[]).filter(
          (entry) => entry.tasks?.projects?.clients?.id === client.id
        );
        const unbilledMinutes = clientUnbilledEntries.reduce(
          (sum, entry) => sum + (entry.duration_minutes || 0),
          0
        );
        const unbilledAmount = clientUnbilledEntries.reduce(
          (sum, entry) => sum + (entry.amount || 0),
          0
        );

        // Billed but unpaid (draft or sent)
        const clientUnpaidInvoices = (invoicesData as any[]).filter(
          (inv) =>
            inv.clients?.id === client.id &&
            (inv.status === "draft" || inv.status === "sent")
        );
        const billedUnpaidAmount = clientUnpaidInvoices.reduce(
          (sum, inv) => sum + (inv.total_amount || 0),
          0
        );

        // Billed and paid
        const clientPaidInvoices = (invoicesData as any[]).filter(
          (inv) => inv.clients?.id === client.id && inv.status === "paid"
        );
        const billedPaidAmount = clientPaidInvoices.reduce(
          (sum, inv) => sum + (inv.total_amount || 0),
          0
        );

        return {
          clientId: client.id,
          clientName: client.name,
          currency: client.currency,
          unbilledHours: unbilledMinutes,
          unbilledAmount,
          billedUnpaidAmount,
          billedPaidAmount,
        };
      });

      setClientSummaries(summaries);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!formData.client_id) {
      alert("Por favor selecciona un cliente");
      return;
    }

    try {
      const selectedEntries = timeEntries.filter(
        (entry: any) => entry.tasks?.projects?.clients?.id === formData.client_id
      );

      if (selectedEntries.length === 0) {
        alert("No hay períodos de trabajo sin facturar para este cliente");
        return;
      }

      // Calculate totals
      const subtotal = selectedEntries.reduce(
        (sum, entry) => sum + (entry.amount || 0),
        0
      );
      const taxRate = parseFloat(formData.tax_rate) || 0;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      const client = clients.find((c) => c.id === formData.client_id);
      if (!client) return;

      // Create invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          client_id: formData.client_id,
          status: "draft",
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total_amount: total,
          currency: client.currency,
          due_date: formData.due_date || null,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items
      const items = selectedEntries.map((entry: any) => ({
        invoice_id: invoice.id,
        time_entry_id: entry.id,
        description: entry.description || entry.tasks?.name || "Trabajo",
        quantity: (entry.duration_minutes || 0) / 60,
        rate: entry.rate_applied || 0,
        amount: entry.amount || 0,
        type: "time" as const,
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(items);

      if (itemsError) throw itemsError;

      setIsDialogOpen(false);
      setFormData({ client_id: "", tax_rate: "0", due_date: "" });
      loadData();
      alert("Factura creada exitosamente");
    } catch (error) {
      console.error("Error creating invoice:", error);
      alert("Error al crear la factura");
    }
  };

  const handleStatusChange = async (invoiceId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === "paid") {
        updateData.paid_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", invoiceId);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error("Error updating invoice status:", error);
      alert("Error al actualizar el estado de la factura");
    }
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Facturas</h1>
          <p className="text-muted-foreground">
            Gestiona tus facturas y estados de pago
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={clients.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Factura
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nueva Factura</DialogTitle>
              <DialogDescription>
                Crea una factura desde períodos de trabajo sin facturar
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Cliente *</label>
                <Select
                  value={formData.client_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, client_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => {
                      const clientEntries = timeEntries.filter(
                        (entry: any) =>
                          entry.tasks?.projects?.clients?.id === client.id
                      );
                      return (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name} ({clientEntries.length} períodos)
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Impuesto (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.tax_rate}
                  onChange={(e) =>
                    setFormData({ ...formData, tax_rate: e.target.value })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Fecha de Vencimiento</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) =>
                    setFormData({ ...formData, due_date: e.target.value })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleCreateInvoice}>Crear Factura</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabla de resumen por cliente */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen por Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Cliente</th>
                  <th className="text-right p-2 font-medium">Horas Sin Facturar</th>
                  <th className="text-right p-2 font-medium">Monto Sin Facturar</th>
                  <th className="text-right p-2 font-medium">Facturado No Pagado</th>
                  <th className="text-right p-2 font-medium">Facturado y Pagado</th>
                </tr>
              </thead>
              <tbody>
                {clientSummaries.map((summary) => (
                  <tr key={summary.clientId} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{summary.clientName}</td>
                    <td className="p-2 text-right">
                      {formatTime(summary.unbilledHours)}h
                    </td>
                    <td className="p-2 text-right">
                      {summary.unbilledAmount.toFixed(2)} {summary.currency}
                    </td>
                    <td className="p-2 text-right">
                      {summary.billedUnpaidAmount.toFixed(2)} {summary.currency}
                    </td>
                    <td className="p-2 text-right">
                      {summary.billedPaidAmount.toFixed(2)} {summary.currency}
                    </td>
                  </tr>
                ))}
                {clientSummaries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      No hay clientes registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
                      {invoice.clients.name} -{" "}
                      {format(new Date(invoice.issue_date), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl font-bold">
                      {invoice.total_amount.toFixed(2)} {invoice.currency}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex space-x-2">
                    <Select
                      value={invoice.status}
                      onValueChange={(value) =>
                        handleStatusChange(invoice.id, value)
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INVOICE_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Link href={`/dashboard/invoices/${invoice.id}`}>
                      <Button variant="outline">
                        <FileText className="mr-2 h-4 w-4" />
                        Ver Detalles
                      </Button>
                    </Link>
                  </div>
                  {invoice.due_date && (
                    <p className="text-sm text-muted-foreground">
                      Vence: {format(new Date(invoice.due_date), "dd/MM/yyyy")}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {invoices.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No hay facturas creadas. Crea tu primera factura.
          </p>
        </div>
      )}
    </div>
  );
}

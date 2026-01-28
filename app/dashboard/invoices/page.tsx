"use client";

import { useEffect, useState } from "react";
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
import { format } from "date-fns";
import Link from "next/link";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";
import { getClients } from "@/lib/actions/clients";
import {
    getInvoices,
    getUnbilledTimeEntries,
    createInvoiceFromTimeEntries,
    updateInvoiceStatus,
    getClientBillingSummary,
} from "@/lib/actions/invoices";
import type { invoices, clients, time_entries } from "@/lib/generated/prisma";
import { toast } from "@/hooks/use-toast";

interface InvoiceWithClient extends invoices {
  client: clients;
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
  const [clients, setClients] = useState<clients[]>([]);
  const [timeEntries, setTimeEntries] = useState<time_entries[]>([]);
  const [clientSummaries, setClientSummaries] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
      // Load clients
      const clientsData = await getClients();
      setClients(clientsData);

      // Load invoices
      const invoicesData = await getInvoices();
      setInvoices(invoicesData);

      // Load unbilled time entries
      const unbilledEntries = await getUnbilledTimeEntries();
      setTimeEntries(unbilledEntries);

      // Get client billing summaries
      const summaries = await getClientBillingSummary();
      setClientSummaries(summaries);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!formData.client_id) {
      toast({
        title: "Error",
        description: "Por favor selecciona un cliente",
        variant: "destructive",
      });
      return;
    }

    try {
      const selectedEntries = timeEntries.filter(
        (entry) => {
          const task = (entry as any).task;
          const project = task?.project;
          const client = project?.client;
          return client?.id === formData.client_id;
        }
      );

      if (selectedEntries.length === 0) {
        toast({
          title: "Error",
          description: "No hay períodos de trabajo sin facturar para este cliente",
          variant: "destructive",
        });
        return;
      }

      const timeEntryIds = selectedEntries.map((entry) => entry.id);
      const taxRate = parseFloat(formData.tax_rate) || 0;
      const dueDate = formData.due_date ? new Date(formData.due_date) : null;

      const result = await createInvoiceFromTimeEntries({
        client_id: formData.client_id,
        time_entry_ids: timeEntryIds,
        tax_rate: taxRate,
        due_date: dueDate,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: "Éxito",
        description: "Factura creada exitosamente",
      });

      setIsDialogOpen(false);
      setFormData({ client_id: "", tax_rate: "0", due_date: "" });
      loadData();
    } catch (error) {
      console.error("Error creating invoice:", error);
      toast({
        title: "Error",
        description: "Error al crear la factura",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (invoiceId: string, newStatus: string) => {
    try {
      const result = await updateInvoiceStatus(
        invoiceId,
        newStatus as "draft" | "sent" | "paid" | "overdue"
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: "Éxito",
        description: "Estado de factura actualizado correctamente.",
      });

      loadData();
    } catch (error) {
      console.error("Error updating invoice status:", error);
      toast({
        title: "Error",
        description: "Error al actualizar el estado de la factura",
        variant: "destructive",
      });
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
                        (entry) => {
                          const task = (entry as any).task;
                          const project = task?.project;
                          const entryClient = project?.client;
                          return entryClient?.id === client.id;
                        }
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
                      {Number(summary.unbilledAmount).toFixed(2)} {summary.currency}
                    </td>
                    <td className="p-2 text-right">
                      {Number(summary.billedUnpaidAmount).toFixed(2)} {summary.currency}
                    </td>
                    <td className="p-2 text-right">
                      {Number(summary.billedPaidAmount).toFixed(2)} {summary.currency}
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
                      {invoice.client.name} -{" "}
                      {format(new Date(invoice.issue_date), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl font-bold">
                      {Number(invoice.total_amount).toFixed(2)} {invoice.currency}
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

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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Plus, FileText, CheckCircle2, AlertCircle, Clock, Banknote, Coffee, History, ShieldAlert, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { getClients } from "@/lib/actions/clients";
import {
  getInvoices,
  getUnbilledTimeEntries,
  createInvoiceFromTimeEntries,
  updateInvoiceStatus,
  getClientBillingSummary,
} from "@/lib/actions/invoices";
import { recordPayment } from "@/lib/actions/payments";
import type { invoices, clients, time_entries } from "@prisma/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface InvoiceWithClient extends invoices {
  client: clients;
  payments?: any[];
}

const INVOICE_STATUSES = [
  { value: "draft", label: "Borrador", color: "bg-gray-100 text-gray-800", icon: Clock },
  { value: "sent", label: "Enviada", color: "bg-blue-100 text-blue-800", icon: Send },
  { value: "partial", label: "Parcial", color: "bg-amber-100 text-amber-800", icon: History },
  { value: "paid", label: "Pagada", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  { value: "overdue", label: "Vencida", color: "bg-rose-100 text-rose-800", icon: AlertCircle },
];

function Send({ className }: { className?: string }) {
  return <Banknote className={className} />; // Placeholder icon
}

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
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithClient | null>(null);

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    date: format(new Date(), "yyyy-MM-dd"),
    method: "Transferencia",
    notes: ""
  });

  const [formData, setFormData] = useState({
    client_id: "",
    tax_rate: "0",
    due_date: format(new Date(Date.now() + 15 * 86400000), "yyyy-MM-dd"),
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [clientsData, invoicesData, unbilledEntries, summaries] = await Promise.all([
        getClients(),
        getInvoices(),
        getUnbilledTimeEntries(),
        getClientBillingSummary()
      ]);
      setClients(clientsData);
      setInvoices(invoicesData as any);
      setTimeEntries(unbilledEntries as any);
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

  const handleCreateInvoice = async (clientId?: string) => {
    const targetClientId = clientId || formData.client_id;
    if (!targetClientId) {
      toast({ title: "Error", description: "Selecciona un cliente", variant: "destructive" });
      return;
    }

    try {
      const clientEntries = timeEntries.filter((e: any) => e.task?.project?.client?.id === targetClientId);
      if (clientEntries.length === 0) {
        toast({ title: "Error", description: "No hay horas pendientes", variant: "destructive" });
        return;
      }

      const result = await createInvoiceFromTimeEntries({
        client_id: targetClientId,
        time_entry_ids: clientEntries.map(e => e.id),
        tax_rate: parseFloat(formData.tax_rate) || 0,
        due_date: formData.due_date ? new Date(formData.due_date) : null,
      });

      if (!result.success) throw new Error(result.error);
      toast({ title: "Éxito", description: "Factura creada correctamente" });
      setIsNewInvoiceOpen(false);
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    try {
      const result = await recordPayment({
        invoice_id: selectedInvoice.id,
        amount: parseFloat(paymentForm.amount),
        payment_date: new Date(paymentForm.date),
        method: paymentForm.method,
        notes: paymentForm.notes
      });

      if (!result.success) throw new Error(result.error);
      toast({ title: "Cobro registrado", description: "El pago se aplicó a la factura" });
      setIsPaymentOpen(false);
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando módulo de facturación...</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Facturación</h1>
          <p className="text-muted-foreground">Control de horas trabajadas y gestión de cobros</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isNewInvoiceOpen} onOpenChange={setIsNewInvoiceOpen}>
            <DialogTrigger asChild>
              <Button className="h-9">
                <Plus className="mr-2 h-4 w-4" /> Facturar Selección
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva Factura</DialogTitle>
                <DialogDescription>Selecciona un cliente para consolidar sus horas pendientes en una factura.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={formData.client_id} onValueChange={(v) => setFormData({ ...formData, client_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tax (%)</Label>
                    <Input type="number" value={formData.tax_rate} onChange={e => setFormData({ ...formData, tax_rate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Vencimiento</Label>
                    <Input type="date" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewInvoiceOpen(false)}>Cancelar</Button>
                <Button onClick={() => handleCreateInvoice()}>Generar Factura</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* VISTA DE PENDIENTES (Compacta/Instrumental) */}
      <Card className="border-2 shadow-sm">
        <CardHeader className="bg-muted/30 pb-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            TRABAJO PENDIENTE DE FACTURAR
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-y">
                <tr>
                  <th className="text-left p-3 font-semibold uppercase tracking-wider">Cliente</th>
                  <th className="text-right p-3 font-semibold uppercase tracking-wider">Horas</th>
                  <th className="text-right p-3 font-semibold uppercase tracking-wider">Monto Est.</th>
                  <th className="text-right p-3 font-semibold uppercase tracking-wider">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clientSummaries.filter(s => s.unbilledAmount > 0).map((summary) => (
                  <tr key={summary.clientId} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium">
                      <div className="flex flex-col">
                        <span>{summary.clientName}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{summary.currency}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono">
                      {(summary.unbilledHours / 60).toFixed(2)}h
                    </td>
                    <td className="p-3 text-right font-bold text-amber-600">
                      {Number(summary.unbilledAmount).toLocaleString()} {summary.currency}
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/dashboard/billing/select/${summary.clientId}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] font-bold border hover:bg-amber-50 hover:text-amber-700 uppercase"
                        >
                          Facturar
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
                {clientSummaries.filter(s => s.unbilledAmount > 0).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground italic">
                      Todos los trabajos han sido facturados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* GESTION DE FACTURAS */}
      <div className="grid gap-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mt-4">
          <FileText className="h-5 w-5" />
          GESTIÓN DE FACTURAS
        </h2>
        <div className="grid gap-3">
          {invoices.map((invoice) => {
            const status = INVOICE_STATUSES.find(s => s.value === invoice.status) || INVOICE_STATUSES[0];
            const StatusIcon = status.icon;
            const isInternal = invoice.billing_type === 'INTERNAL';
            const borderLeftColor = isInternal
              ? "#9333ea" // Purple for Internal
              : (status.value === 'paid' ? '#10b981' : (status.value === 'partial' ? '#f59e0b' : '#ddd'));

            return (
              <Card key={invoice.id} className="overflow-hidden border-l-4" style={{ borderLeftColor }}>
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("p-2 rounded-lg", status.color.replace('text-', 'bg-opacity-10 text-'))}>
                      <StatusIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">{invoice.invoice_number}</span>
                        <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", status.color)}>
                          {status.label}
                        </span>
                        {invoice.billing_type === 'INTERNAL' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-700 flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" /> INTERNO
                          </span>
                        )}
                        {invoice.billing_type === 'LEGAL' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700 flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> LEGAL
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground/80 font-medium">{invoice.client.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Emitida: {format(new Date(invoice.issue_date), "dd/MM/yyyy")}</p>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end">
                    <span className="text-xl font-black">{Number(invoice.total_amount).toLocaleString()} {invoice.currency}</span>
                    {invoice.due_date && (
                      <span className="text-[10px] text-muted-foreground">Vence: {format(new Date(invoice.due_date), "dd/MM/yyyy")}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0">
                    <Link href={`/dashboard/invoices/${invoice.id}`} passHref>
                      <Button variant="outline" size="sm" className="h-8 text-xs font-bold">DETALLES</Button>
                    </Link>

                    {invoice.status !== 'paid' && (
                      <Button
                        size="sm"
                        className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => {
                          setSelectedInvoice(invoice);
                          setPaymentForm({
                            ...paymentForm,
                            amount: Number(invoice.total_amount).toString()
                          });
                          setIsPaymentOpen(true);
                        }}
                      >
                        REGISTRAR PAGO
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {invoices.length === 0 && (
            <div className="py-20 text-center border-2 border-dashed rounded-xl">
              <Coffee className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground font-medium">No hay facturas emitidas aún.</p>
            </div>
          )}
        </div>
      </div>

      {/* DIALOGO DE PAGO */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-600" />
              Registrar Cobro
            </DialogTitle>
            <DialogDescription>
              Aplica un pago a la factura <strong>{selectedInvoice?.invoice_number}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRegisterPayment}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Monto a Cobrar ({selectedInvoice?.currency})</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground">Total factura: {Number(selectedInvoice?.total_amount).toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                <Label>Fecha de Pago</Label>
                <Input
                  type="date"
                  required
                  value={paymentForm.date}
                  onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Método</Label>
                <Select value={paymentForm.method} onValueChange={v => setPaymentForm({ ...paymentForm, method: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Input
                  placeholder="Opcional..."
                  value={paymentForm.notes}
                  onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPaymentOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Confirmar Cobro</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

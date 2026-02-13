"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Send, ArrowLeft, CheckCircle2, History, AlertCircle, Banknote, Loader2, FileText, ShieldCheck, AlertTriangle, XCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { getInvoiceWithItems, deleteInvoice } from "@/lib/actions/invoices";
import { generateFiscalInvoice, generateCreditNote } from "@/lib/actions/afip-actions";
import { getUserFiscalSettings } from "@/lib/actions/user-settings";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const [invoice, setInvoice] = useState<any | null>(null);
  const [issuerName, setIssuerName] = useState<string>("Lucas Loyola");
  const [loading, setLoading] = useState(true);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [creditNoteLoading, setCreditNoteLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      const [data, fiscalSettings] = await Promise.all([
        getInvoiceWithItems(invoiceId),
        getUserFiscalSettings(),
      ]);
      if (!data) throw new Error("Factura no encontrada");
      setInvoice(data);
      setIssuerName(fiscalSettings?.business_name || "Lucas Loyola");
    } catch (error: any) {
      console.error("Error loading invoice:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCAE = async () => {
    setFiscalLoading(true);
    try {
      const result = await generateFiscalInvoice(invoiceId);
      if (result.success) {
        toast({
          title: "ÉXITO FISCAL",
          description: `CAE obtenido: ${result.cae}. Comprobante Nro: ${result.cbte_nro}`,
        });
        await loadInvoice();
      } else {
        toast({
          title: "ERROR AFIP",
          description: result.error,
          variant: "destructive"
        });
        await loadInvoice(); // Recargamos para mostrar el log de error en la UI
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setFiscalLoading(false);
    }
  };

  const handleGenerateCreditNote = async () => {
    if (!confirm("¿Estás seguro de anular esta factura? Se generará una Nota de Crédito ante AFIP.")) {
      return;
    }

    setCreditNoteLoading(true);
    try {
      const result = await generateCreditNote(invoiceId);
      if (result.success) {
        toast({
          title: "NOTA DE CRÉDITO GENERADA",
          description: `CAE obtenido: ${result.cae}. Comprobante Nro: ${result.cbte_nro}`,
        });
        await loadInvoice();
        router.push(`/dashboard/invoices/${result.credit_note_id}`);
      } else {
        toast({
          title: "ERROR AL GENERAR NOTA DE CRÉDITO",
          description: result.error,
          variant: "destructive"
        });
        await loadInvoice();
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setCreditNoteLoading(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!invoice || invoice.status !== "draft") return;
    if (!confirm("¿Eliminar esta factura en borrador? Las horas volverán a estar pendientes de facturar.")) return;
    setDeleteLoading(true);
    try {
      const result = await deleteInvoice(invoice.id);
      if (!result.success) throw new Error(result.error);
      toast({ title: "Factura eliminada", description: "Las horas vinculadas volvieron a pendiente." });
      router.push("/dashboard/invoices");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground font-mono">RECUPERANDO DATOS...</div>;
  if (!invoice) return <div className="p-8 text-center">Factura no encontrada</div>;

  const totalPaid = invoice.payments?.reduce((acc: number, p: any) => acc + Number(p.amount), 0) || 0;
  const remaining = Number(invoice.total_amount) - totalPaid;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-black uppercase tracking-tighter">Detalle de Factura</h1>
        </div>
        {invoice.status === "draft" && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-red-600 hover:bg-red-50"
            onClick={handleDeleteDraft}
            disabled={deleteLoading}
            aria-label="Eliminar factura"
          >
            {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-2">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Comprobante</span>
                  <CardTitle className="text-2xl font-black">{invoice.invoice_number}</CardTitle>
                  {invoice.billing_type === "LEGAL" && invoice.cae && invoice.cbte_nro != null && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Comprobante AFIP: {String(invoice.punto_venta ?? 3).padStart(5, "0")}-{String(invoice.cbte_nro).padStart(8, "0")}
                    </p>
                  )}
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase",
                  invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                )}>
                  {invoice.status}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-2 gap-8 text-sm">
                <div className="space-y-1">
                  <Label>Emisor</Label>
                  <p className="font-bold uppercase tracking-tight">{issuerName}</p>
                </div>
                <div className="space-y-1">
                  <Label>Cliente</Label>
                  <p className="font-bold">{invoice.clients.name}</p>
                  <p className="text-xs text-muted-foreground">{invoice.clients.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="uppercase text-[10px] tracking-widest text-muted-foreground">Productos / Servicios</Label>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 border-r">Descripción</th>
                        <th className="text-right p-2 border-r">Cant.</th>
                        <th className="text-right p-2">Subtotal ({invoice.currency})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {invoice.invoice_items.map((item: any) => {
                        const entryDate = item.time_entry?.start_time ? format(new Date(item.time_entry.start_time), "dd/MM/yy") : null;
                        return (
                          <tr key={item.id} className="hover:bg-muted/30">
                            <td className="p-2 border-r font-medium">
                              {entryDate && <span className="text-muted-foreground mr-1">({entryDate}) -</span>}
                              {item.description}
                            </td>
                            <td className="p-2 border-r text-right font-mono">{Number(item.quantity).toFixed(2)}h</td>
                            <td className="p-2 text-right font-mono font-bold leading-none">
                              <div className="flex flex-col">
                                <span>{Math.round(Number(item.amount)).toLocaleString()}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <div className="w-64 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-mono">{Math.round(Number(invoice.subtotal)).toLocaleString()} {invoice.currency}</span>
                  </div>
                  {Number(invoice.tax_amount) > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span className="text-muted-foreground">Impuestos ({Number(invoice.tax_rate)}%):</span>
                      <span className="font-mono">+{Math.round(Number(invoice.tax_amount)).toLocaleString()} {invoice.currency}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 text-lg font-black bg-muted/10 p-2 rounded">
                    <span>TOTAL:</span>
                    <span>{Math.round(Number(invoice.total_amount)).toLocaleString()} {invoice.currency}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {invoice.notes && (
            <Card className="bg-amber-50/10 border-amber-100/20">
              <CardContent className="p-4 text-xs text-amber-900/80 leading-relaxed font-mono">
                <div className="flex items-center gap-2 mb-2">
                  <History className="h-3 w-3" />
                  <span className="font-black uppercase tracking-widest">Notas Administrativas</span>
                </div>
                {invoice.notes}
              </CardContent>
            </Card>
          )}

          {invoice.afip_error && (
            <Card className="bg-rose-50/10 border-rose-500/20">
              <CardContent className="p-4 text-[10px] text-rose-500 leading-relaxed font-mono">
                <div className="flex items-center gap-2 mb-2 text-rose-600">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="font-black uppercase tracking-widest">LOG DE ERROR AFIP (ARCA)</span>
                </div>
                {invoice.afip_error}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                <Banknote className="h-4 w-4 text-emerald-600" />
                ESTADO DE COBRO
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span>Cobrado:</span>
                  <span className="text-emerald-600">{Math.round(totalPaid).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span>Pendiente:</span>
                  <span className="text-amber-600">{Math.round(remaining).toLocaleString()}</span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all"
                    style={{ width: `${(totalPaid / Number(invoice.total_amount)) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Historial de Pagos</Label>
                <div className="space-y-2">
                  {invoice.payments?.map((p: any) => (
                    <div key={p.id} className="text-xs p-2 bg-muted/40 rounded border-l-2 border-emerald-500 flex justify-between items-center">
                      <div>
                        <p className="font-bold">{format(new Date(p.payment_date), "dd/MM/yyyy")}</p>
                        <p className="text-[10px] text-muted-foreground">{p.method}</p>
                      </div>
                      <span className="font-black">+{Math.round(Number(p.amount)).toLocaleString()}</span>
                    </div>
                  ))}
                  {(!invoice.payments || invoice.payments.length === 0) && (
                    <p className="text-xs text-center text-muted-foreground py-4 italic">Sin pagos registrados</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Facturación Electrónica (AFIP)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {invoice.cae ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Comprobante</Label>
                      <p className="font-black font-mono text-sm">
                        {String(invoice.punto_venta ?? 3).padStart(5, '0')}-{String(invoice.cbte_nro).padStart(8, '0')}
                      </p>
                    </div>
                    <div>
                      <Label>CAE</Label>
                      <p className="font-black font-mono text-sm tracking-tighter text-primary">{invoice.cae}</p>
                    </div>
                  </div>
                  <div>
                    <Label>Vencimiento CAE</Label>
                    <p className="font-bold text-xs">
                      {invoice.cae_due_date ? format(new Date(invoice.cae_due_date), "dd/MM/yyyy") : '-'}
                    </p>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Factura Validada por ARCA</span>
                  </div>
                  
                  {invoice.status !== 'cancelled' && (
                    <Button
                      variant="destructive"
                      className="w-full font-black uppercase tracking-tighter"
                      onClick={handleGenerateCreditNote}
                      disabled={creditNoteLoading}
                    >
                      {creditNoteLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          GENERANDO NOTA DE CRÉDITO...
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          Anular Factura (Nota de Crédito)
                        </>
                      )}
                    </Button>
                  )}
                  
                  {invoice.status === 'cancelled' && (
                    <div className="bg-red-500/10 border border-red-500/30 p-2 rounded flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-[10px] font-black text-red-700 uppercase tracking-widest">Factura Anulada</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-muted/50 rounded-lg space-y-2 border border-dashed">
                    <div className="flex justify-between items-center text-[10px] font-bold opacity-60">
                      <span>PUNTO DE VENTA</span>
                      <span>{invoice.punto_venta ?? 3}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-bold opacity-60">
                      <span>TIPO DE COMPROBANTE</span>
                      <span>FACTURA C (11)</span>
                    </div>
                  </div>

                  <Button
                    className="w-full font-black uppercase tracking-tighter shadow-lg shadow-primary/20"
                    onClick={handleRequestCAE}
                    disabled={fiscalLoading}
                  >
                    {fiscalLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        AUTORIZANDO...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Emitir Factura Electrónica
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest leading-tight">
                    ESTO GENERARÁ UN COMPROBANTE LEGAL ANTE AFIP EN MODO HOMOLOGACIÓN
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode, className?: string }) {
  return <span className={cn("text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1", className)}>{children}</span>
}

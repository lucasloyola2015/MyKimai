"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Clock, DollarSign, FileText, Loader2, Save } from "lucide-react";
import { format } from "date-fns";
import { getUnbilledTimeEntries, createInvoiceFromTimeEntries } from "@/lib/actions/invoices";
import { getClients } from "@/lib/actions/clients";
import type { time_entries, clients } from "@prisma/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export default function PartialBillingPage() {
    const { clientId } = useParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [timeEntries, setTimeEntries] = useState<any[]>([]);
    const [client, setClient] = useState<clients | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [taxRate, setTaxRate] = useState("0");
    const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 15 * 86400000), "yyyy-MM-dd"));
    const [billingType, setBillingType] = useState<string>("LEGAL");
    const [billingCurrency, setBillingCurrency] = useState<"ARS" | "USD">("ARS");

    useEffect(() => {
        loadData();
    }, [clientId]);

    const loadData = async () => {
        try {
            const [entries, allClients] = await Promise.all([
                getUnbilledTimeEntries(clientId as string),
                getClients()
            ]);
            setTimeEntries(entries);
            const currentClient = allClients.find(c => c.id === clientId);
            if (currentClient) {
                setClient(currentClient);
                if ((currentClient as any).preferred_billing_method) {
                    setBillingType((currentClient as any).preferred_billing_method);
                }
            }
        } catch (error) {
            console.error("Error loading entries:", error);
            toast({ title: "Error", description: "No se pudieron cargar las horas pendientes.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const selectedEntries = useMemo(() => {
        return timeEntries.filter(e => selectedIds.includes(e.id));
    }, [timeEntries, selectedIds]);

    const summary = useMemo(() => {
        const totalMinutes = selectedEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

        let subtotal = 0;

        if (billingCurrency === "ARS") {
            // Calcular usando exchange rate guardado en cada entry
            subtotal = selectedEntries.reduce((sum, e) => {
                const amountUsd = Number(e.amount || 0);
                const rate = Number(e.usd_exchange_rate || 1050);
                return sum + (amountUsd * rate);
            }, 0);
        } else {
            // Suma simple de USD
            subtotal = selectedEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        }

        const tax = subtotal * (parseFloat(taxRate) / 100 || 0);
        return {
            hours: (totalMinutes / 60).toFixed(2),
            subtotal,
            tax,
            total: subtotal + tax
        };
    }, [selectedEntries, taxRate, billingCurrency]);

    const handleToggleAll = () => {
        if (selectedIds.length === timeEntries.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(timeEntries.map(e => e.id));
        }
    };

    const handleToggleEntry = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleCreateInvoice = async () => {
        if (selectedIds.length === 0) {
            toast({ title: "Error", description: "Selecciona al menos una entrada", variant: "destructive" });
            return;
        }

        setSubmitting(true);
        try {
            const result = await createInvoiceFromTimeEntries({
                client_id: clientId as string,
                time_entry_ids: selectedIds,
                tax_rate: parseFloat(taxRate) || 0,
                due_date: new Date(dueDate),
                billing_type: billingType as any,
            });

            if (!result.success) throw new Error(result.error);

            toast({ title: "Éxito", description: "Factura parcial creada correctamente" });
            router.push("/dashboard/invoices");
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        Cargando horas de {client?.name || "cliente"}...
    </div>;

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-12">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Facturación Parcial</h1>
                    <p className="text-muted-foreground">Seleccionando horas para: <span className="text-foreground font-semibold">{client?.name}</span></p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LISTA DE SELECCIÓN */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-bold uppercase">Entradas Disponibles</CardTitle>
                            <Button variant="ghost" size="sm" className="text-xs" onClick={handleToggleAll}>
                                {selectedIds.length === timeEntries.length ? "Desmarcar Todo" : "Marcar Todo"}
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y border-t">
                                {timeEntries.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className={cn(
                                            "p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer",
                                            selectedIds.includes(entry.id) && "bg-primary/5"
                                        )}
                                        onClick={() => handleToggleEntry(entry.id)}
                                    >
                                        <Checkbox
                                            checked={selectedIds.includes(entry.id)}
                                            onCheckedChange={() => handleToggleEntry(entry.id)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start gap-2">
                                                <p className="font-semibold text-sm truncate">{entry.description || entry.task.name}</p>
                                                <div className="flex flex-col items-end">
                                                    <span className="font-mono text-sm font-bold whitespace-nowrap">
                                                        {billingCurrency === "ARS"
                                                            ? (Number(entry.amount || 0) * Number(entry.usd_exchange_rate || 1050)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                            : Number(entry.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                        } {billingCurrency}
                                                    </span>
                                                    {billingCurrency === "ARS" && entry.usd_exchange_rate && (
                                                        <span className="text-[9px] text-muted-foreground font-mono">
                                                            USD {Number(entry.amount).toFixed(2)} @ {Number(entry.usd_exchange_rate).toFixed(0)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {(entry.duration_minutes / 60).toFixed(1)}h</span>
                                                <span>•</span>
                                                <span>{format(new Date(entry.start_time), "dd MMM, yyyy")}</span>
                                                <span>•</span>
                                                <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">{entry.task.project.name}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {timeEntries.length === 0 && (
                                    <div className="p-12 text-center text-muted-foreground italic">
                                        No hay horas pendientes para este cliente.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* RESUMEN DE FACTURACIÓN */}
                <div className="space-y-6">
                    <Card className="border-2 border-primary/20 sticky top-24">
                        <CardHeader className="bg-primary/5 pb-4">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                RESUMEN DE FACTURA
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Horas seleccionadas:</span>
                                    <span className="font-bold">{summary.hours}h</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Subtotal:</span>
                                    <span className="font-bold">{summary.subtotal.toLocaleString()} {billingCurrency}</span>
                                </div>
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-2">
                                        <Label>Moneda del Comprobante</Label>
                                        <Select
                                            value={billingCurrency}
                                            onValueChange={(v: "ARS" | "USD") => setBillingCurrency(v)}
                                        >
                                            <SelectTrigger className="w-full h-10 font-bold border-primary/20">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ARS">ARS - Pesos Argentinos</SelectItem>
                                                <SelectItem value="USD">USD - Dólares Estadounidenses</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[10px] text-muted-foreground px-1 italic">
                                            {billingCurrency === "ARS"
                                                ? "Las jornadas se pesifican según el tipo de cambio oficial de cada fecha."
                                                : "Se factura el monto bruto en USD sin conversión."}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Tipo de Comprobante</Label>
                                        <Select value={billingType} onValueChange={setBillingType}>
                                            <SelectTrigger className={cn(
                                                "w-full h-12 font-bold",
                                                billingType === 'LEGAL' ? "border-blue-500 bg-blue-50/50 text-blue-700" : "border-slate-500 bg-slate-50/50 text-slate-700"
                                            )}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="LEGAL">
                                                    <div className="flex items-center gap-2">
                                                        <ShieldCheck className="h-4 w-4 text-blue-600" />
                                                        <span>Factura Electrónica (AFIP)</span>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="INTERNAL">
                                                    <div className="flex items-center gap-2">
                                                        <ShieldAlert className="h-4 w-4 text-slate-600" />
                                                        <span>Comprobante Interno</span>
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[10px] text-muted-foreground px-1 italic">
                                            {billingType === 'LEGAL'
                                                ? "⚠️ Este documento será fiscalizado por AFIP/ARCA."
                                                : "ℹ️ Documento de uso administrativo interno (no fiscal)."}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="tax">Tax %</Label>
                                            <Input id="tax" type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)} className="h-8" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="date">Vence</Label>
                                            <Input id="date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-black text-white p-4 rounded-xl space-y-1">
                                <p className="text-[10px] uppercase tracking-widest font-bold opacity-60">Total a Facturar</p>
                                <div className="flex items-baseline justify-between transition-all duration-300">
                                    <span className="text-3xl font-black">{summary.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    <span className="text-xs font-bold">{billingCurrency}</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-muted/30 pt-4">
                            <Button
                                className="w-full font-bold h-11"
                                disabled={selectedIds.length === 0 || submitting}
                                onClick={handleCreateInvoice}
                            >
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                CREAR FACTURA DRAFT
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    );
}

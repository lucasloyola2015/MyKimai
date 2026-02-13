"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Clock, DollarSign, FileText, Loader2, Save, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { getUnbilledTimeEntries, createInvoiceFromTimeEntries } from "@/lib/actions/invoices";
import { getClients } from "@/lib/actions/clients";
import { getUserFiscalSettings } from "@/lib/actions/user-settings";
import type { time_entries, clients } from "@prisma/client";
import { getUsdExchangeRateInfo, type UsdExchangeInfo } from "@/lib/actions/exchange";
import { es } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { generateFiscalInvoice } from "@/lib/actions/afip-actions";
import { fillInvoiceTemplate, previewDataToTemplateData } from "@/lib/invoice-template";

export default function PartialBillingPage() {
    const params = useParams();
    const clientId = typeof params.clientId === "string" ? params.clientId : params.clientId?.[0] ?? "";
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [timeEntries, setTimeEntries] = useState<any[]>([]);
    const [client, setClient] = useState<clients | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 15 * 86400000), "yyyy-MM-dd"));
    const [billingType, setBillingType] = useState<string>("LEGAL");
    const [cbteTipo, setCbteTipo] = useState<number>(11); // 11 = Factura C
    const [billingCurrency, setBillingCurrency] = useState<"ARS" | "USD">("ARS");
    const [exchangeStrategy, setExchangeStrategy] = useState<"CURRENT" | "HISTORICAL">("CURRENT");
    const [currentRate, setCurrentRate] = useState<number>(0);
    const [exchangeInfo, setExchangeInfo] = useState<UsdExchangeInfo | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [issuerData, setIssuerData] = useState<any>(null);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);

    useEffect(() => {
        if (!clientId) return;
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

            const [info, fiscalSettings] = await Promise.all([
                getUsdExchangeRateInfo(),
                getUserFiscalSettings()
            ]);
            setCurrentRate(info.rate);
            setExchangeInfo(info);
            // Si no hay configuración, usar valores por defecto del branding
            setIssuerData(fiscalSettings ? {
                ...fiscalSettings,
                logo_url: fiscalSettings.logo_url || "/logo-lucas-loyola.svg",
                business_name: fiscalSettings.business_name || "Lucas Loyola"
            } : {
                logo_url: "/logo-lucas-loyola.svg",
                business_name: "Lucas Loyola"
            });
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
        const totalMinutes = selectedEntries.reduce((sum, e) => sum + (e.duration_neto || 0), 0);
        const totalUsdFromDb = selectedEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

        let totalToInvoice = 0;

        if (billingCurrency === "ARS") {
            if (exchangeStrategy === "CURRENT") {
                totalToInvoice = totalUsdFromDb * (currentRate || 1050);
            } else {
                totalToInvoice = selectedEntries.reduce((sum, e) => {
                    const amountUsd = Number(e.amount || 0);
                    const rate = Number(e.usd_exchange_rate || 1050);
                    return sum + (amountUsd * rate);
                }, 0);
            }
        } else {
            totalToInvoice = totalUsdFromDb;
        }

        return {
            hours: (totalMinutes / 60).toFixed(2),
            totalUsdFromDb,
            total: totalToInvoice,
        };
    }, [selectedEntries, billingCurrency, exchangeStrategy, currentRate]);

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

    const handleCreateInvoice = () => {
        if (selectedIds.length === 0) {
            toast({ title: "Error", description: "Selecciona al menos una entrada", variant: "destructive" });
            return;
        }
        setShowPreview(true);
    };

    const handleConfirmInvoice = async () => {
        if (!client) return;

        setSubmitting(true);
        try {
            // Crear la factura
            const result = await createInvoiceFromTimeEntries({
                client_id: clientId as string,
                time_entry_ids: selectedIds,
                tax_rate: 0,
                due_date: new Date(dueDate),
                billing_type: billingType as any,
                currency: billingCurrency,
                exchange_strategy: exchangeStrategy,
                cbte_tipo: billingType === "LEGAL" ? cbteTipo : undefined,
            });

            if (!result.success) throw new Error(result.error);

            const invoiceId = result.data.id;

            // Si es factura legal (ARCA), emitir comprobante oficial y obtener CAE
            if (billingType === "LEGAL") {
                try {
                    const fiscalResult = await generateFiscalInvoice(invoiceId);
                    console.log("[AFIP/ARCA] Resultado solicitud CAE (ver F12):", fiscalResult);
                    if ((fiscalResult as { _debug?: object })._debug) {
                        console.log("[AFIP/ARCA] Debug request/response:", (fiscalResult as { _debug: object })._debug);
                    }
                    if (fiscalResult.success) {
                        toast({
                            title: "Factura Creada y Autorizada",
                            description: `CAE obtenido: ${fiscalResult.cae}. Comprobante Nro: ${fiscalResult.cbte_nro}`,
                        });
                    } else {
                        toast({
                            title: "Factura Creada",
                            description: `La factura se creó pero hubo un error al autorizar: ${fiscalResult.error}`,
                            variant: "destructive"
                        });
                    }
                } catch (fiscalError: any) {
                    console.error("[AFIP/ARCA] Error al solicitar CAE:", fiscalError);
                    toast({
                        title: "Factura Creada",
                        description: `La factura se creó pero hubo un error al autorizar: ${fiscalError.message}`,
                        variant: "destructive"
                    });
                }
            } else {
                toast({ title: "Éxito", description: "Factura creada correctamente" });
            }

            setShowPreview(false);
            router.push(`/dashboard/invoices/${invoiceId}`);
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    // Preparar datos para el preview
    const previewData = useMemo(() => {
        if (!client || selectedEntries.length === 0) return null;

        const items = selectedEntries.map(entry => {
            const task = entry.tasks;
            const project = task?.projects ?? (task as any)?.project;
            const projectName = project?.name ?? "—";
            const taskName = task?.name ?? "—";
            const description = entry.description || `${projectName} - ${taskName}`;
            const hours = (entry.duration_neto || 0) / 60;
            
            let amount = Number(entry.amount || 0);
            let rate = Number(entry.rate_applied || 0);

            let exchangeRateUsed: number | undefined;
            let exchangeRateDate: Date | undefined;
            if (billingCurrency === "ARS") {
                if (exchangeStrategy === "CURRENT") {
                    const exchangeRate = currentRate || 1050;
                    exchangeRateUsed = exchangeRate;
                    exchangeRateDate = new Date();
                    amount = amount * exchangeRate;
                    rate = rate * exchangeRate;
                } else {
                    const entryRate = Number(entry.usd_exchange_rate || 1050);
                    exchangeRateUsed = entryRate;
                    exchangeRateDate = entry.start_time ? new Date(entry.start_time) : new Date();
                    amount = amount * entryRate;
                    rate = rate * entryRate;
                }
            }

            // Si no hay rate aplicado, calcularlo desde el amount y las horas
            if (rate === 0 && hours > 0) {
                rate = amount / hours;
            }

            return {
                description,
                quantity: hours,
                rate,
                amount,
                type: "time" as const,
                exchangeRateUsed,
                exchangeRateDate,
            };
        });

        return {
            issuer: {
                business_name: issuerData?.business_name || "Lucas Loyola",
                tax_id: issuerData?.tax_id,
                legal_address: issuerData?.legal_address,
                tax_condition: issuerData?.tax_condition,
                gross_income: issuerData?.gross_income,
                activity_start_date: issuerData?.activity_start_date 
                    ? (() => {
                        // Asegurar que la fecha se lea como fecha local (sin zona horaria)
                        const date = new Date(issuerData.activity_start_date);
                        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
                    })()
                    : null,
                logo_url: issuerData?.logo_url || "/logo-lucas-loyola.svg",
                phone: issuerData?.phone,
                email: issuerData?.email,
            },
            client: {
                name: client.name,
                tax_id: client.tax_id,
                business_name: client.business_name,
                legal_address: client.legal_address,
                email: client.email,
                address: client.address,
            },
            items,
            summary: {
                subtotal: summary.total,
                tax_rate: 0,
                tax_amount: 0,
                total: summary.total,
                currency: billingCurrency,
            },
            billingType: billingType as "LEGAL" | "INTERNAL",
            cbteTipo: billingType === "LEGAL" ? cbteTipo : undefined,
            issueDate: new Date(),
            dueDate: dueDate ? new Date(dueDate) : undefined,
            exchangeInfo: billingCurrency === "ARS" ? exchangeInfo : undefined,
            exchangeStrategy,
        };
    }, [client, selectedEntries, summary, billingType, cbteTipo, billingCurrency, exchangeStrategy, exchangeInfo, currentRate, dueDate, issuerData]);

    // Rellenar plantilla HTML para el preview cuando se abre el diálogo
    useEffect(() => {
        if (!showPreview || !previewData) {
            setPreviewHtml(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/templates/invoice.html");
                if (!res.ok) throw new Error("Template no encontrado");
                const templateHtml = await res.text();
                if (cancelled) return;
                const data = previewDataToTemplateData(previewData as any);
                const html = fillInvoiceTemplate(templateHtml, data);
                if (!cancelled) setPreviewHtml(html);
            } catch (e) {
                console.error("[Preview template]", e);
                if (!cancelled) setPreviewHtml(null);
            }
        })();
        return () => { cancelled = true; };
    }, [showPreview, previewData]);

    if (!clientId) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <p>Cliente no especificado.</p>
                <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard/invoices")}>
                    Volver a Facturas
                </Button>
            </div>
        );
    }

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
                                {timeEntries.map((entry) => {
                                    const task = entry.tasks;
                                    const project = task?.projects ?? (task as any)?.project;
                                    const projectName = project?.name ?? "—";
                                    const taskName = task?.name ?? "—";
                                    const durationNeto = entry.duration_neto ?? 0;
                                    if (!entry?.id) return null;
                                    return (
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
                                                <p className="font-semibold text-sm truncate">{entry.description || taskName}</p>
                                                <div className="flex flex-col items-end">
                                                    <span className="font-mono text-sm font-bold whitespace-nowrap">
                                                        {billingCurrency === "ARS"
                                                            ? (exchangeStrategy === "CURRENT"
                                                                ? Number(entry.amount || 0) * (currentRate || 1050)
                                                                : Number(entry.amount || 0) * Number(entry.usd_exchange_rate || 1050)
                                                            ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                            : Number(entry.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                        } {billingCurrency}
                                                    </span>
                                                    {billingCurrency === "ARS" && (
                                                        <span className="text-[9px] text-muted-foreground font-mono">
                                                            USD {Number(entry.amount ?? 0).toFixed(2)} @ {exchangeStrategy === "CURRENT" ? (currentRate || 1050).toFixed(0) : Number(entry.usd_exchange_rate || 1050).toFixed(0)}
                                                            {exchangeStrategy === "CURRENT" ? " (Hoy)" : ""}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {(durationNeto / 60).toFixed(1)}h</span>
                                                <span>•</span>
                                                <span>{format(new Date(entry.start_time), "dd MMM, yyyy")}</span>
                                                <span>•</span>
                                                <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">{projectName}</span>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })}
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
                        <CardContent className="pt-6 space-y-5">
                            {/* 1. Tipo de Comprobante */}
                            <div className="space-y-2">
                                <Label>Tipo de Comprobante</Label>
                                <Select value={billingType} onValueChange={setBillingType}>
                                    <SelectTrigger className={cn(
                                        "w-full h-11 font-bold",
                                        billingType === "LEGAL" ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" : "border-slate-500 bg-slate-50/50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300"
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
                                <p className="text-[10px] text-muted-foreground italic">
                                    {billingType === "LEGAL" ? "Documento fiscalizado por AFIP/ARCA." : "Uso administrativo interno (no fiscal)."}
                                </p>
                            </div>

                            {/* Tipo de comprobante AFIP (solo si es LEGAL) */}
                            {billingType === "LEGAL" && (
                                <div className="space-y-2">
                                    <Label>Tipo de Comprobante AFIP</Label>
                                    <Select value={cbteTipo.toString()} onValueChange={(v) => setCbteTipo(parseInt(v))}>
                                        <SelectTrigger className="w-full h-10 font-bold border-primary/20">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="11">Factura C (11) - Monotributista</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-muted-foreground italic">
                                        Como monotributista solo puedes emitir Factura C
                                    </p>
                                </div>
                            )}

                            {/* 2. Moneda y Cotización */}
                            <div className="space-y-2">
                                <Label>Moneda del Comprobante</Label>
                                <Select value={billingCurrency} onValueChange={(v: "ARS" | "USD") => setBillingCurrency(v)}>
                                    <SelectTrigger className="w-full h-10 font-bold border-primary/20">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ARS">ARS - Pesos Argentinos</SelectItem>
                                        <SelectItem value="USD">USD - Dólares Estadounidenses</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {billingCurrency === "ARS" && (
                                <div className="space-y-2 p-3 bg-muted/40 rounded-lg border border-border/50">
                                    <Label className="text-[10px] uppercase tracking-wider font-bold opacity-70">Cotización</Label>
                                    <div className="space-y-2 mt-2">
                                        <div
                                            className={cn(
                                                "flex items-center gap-2 p-2 rounded border cursor-pointer transition-all",
                                                exchangeStrategy === "CURRENT" ? "bg-primary/10 border-primary/30" : "bg-background border-transparent"
                                            )}
                                            onClick={() => setExchangeStrategy("CURRENT")}
                                        >
                                            <div className={cn("h-3 w-3 rounded-full border shrink-0", exchangeStrategy === "CURRENT" ? "bg-primary border-primary" : "border-muted-foreground")} />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-bold">Cotización de hoy</span>
                                                <span className="text-[9px] opacity-60 italic">Aplica el tipo de cambio actual a la suma en USD</span>
                                            </div>
                                        </div>
                                        {exchangeStrategy === "CURRENT" && (
                                            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px]">
                                                <p className="font-semibold text-foreground">
                                                    1 USD = {(currentRate || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS
                                                </p>
                                                <p className="text-muted-foreground mt-0.5">
                                                    {exchangeInfo?.source ?? "Dólar Oficial (venta)"} al {exchangeInfo?.updatedAt
                                                        ? format(new Date(exchangeInfo.updatedAt), "d 'de' MMMM yyyy", { locale: es })
                                                        : format(new Date(), "d 'de' MMMM yyyy", { locale: es })}
                                                </p>
                                            </div>
                                        )}
                                        <div
                                            className={cn(
                                                "flex items-center gap-2 p-2 rounded border cursor-pointer transition-all",
                                                exchangeStrategy === "HISTORICAL" ? "bg-primary/10 border-primary/30" : "bg-background border-transparent"
                                            )}
                                            onClick={() => setExchangeStrategy("HISTORICAL")}
                                        >
                                            <div className={cn("h-3 w-3 rounded-full border shrink-0", exchangeStrategy === "HISTORICAL" ? "bg-primary border-primary" : "border-muted-foreground")} />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-bold">Cotización del día de la tarea</span>
                                                <span className="text-[9px] opacity-60 italic">Pesifica cada jornada con el TC de su fecha</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 3. Horas seleccionadas */}
                            <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                                <span className="text-muted-foreground">Horas seleccionadas</span>
                                <span className="font-bold tabular-nums">{summary.hours} h</span>
                            </div>

                            {/* 4. Total USD según base de datos */}
                            <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                                <span className="text-muted-foreground">Total USD (según base de datos)</span>
                                <span className="font-bold font-mono tabular-nums">
                                    {summary.totalUsdFromDb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                                <span className="text-muted-foreground">Valor promedio por hora (USD)</span>
                                <span className="font-mono tabular-nums text-muted-foreground">
                                    {parseFloat(summary.hours) > 0
                                        ? (summary.totalUsdFromDb / parseFloat(summary.hours)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : "—"}{" "}
                                    USD
                                </span>
                            </div>

                            {/* 5. Total a facturar */}
                            <div className="bg-black text-white p-4 rounded-xl space-y-1">
                                <p className="text-[10px] uppercase tracking-widest font-bold opacity-60">Total a facturar</p>
                                <div className="flex items-baseline justify-between transition-all duration-300">
                                    <span className="text-3xl font-black tabular-nums">
                                        {summary.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-xs font-bold">{billingCurrency}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="date" className="text-xs">Fecha de vencimiento</Label>
                                <Input id="date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-9" />
                            </div>
                        </CardContent>
                        <CardFooter className="bg-muted/30 pt-4">
                            <Button
                                className="w-full font-bold h-11"
                                disabled={selectedIds.length === 0 || submitting}
                                onClick={handleCreateInvoice}
                            >
                                <Save className="mr-2 h-4 w-4" />
                                Ver Preview y Crear Factura
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>

            {/* Dialog de Preview: PDF A4 + botones */}
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col p-0">
                    <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Preview de Factura (PDF)
                        </DialogTitle>
                        <DialogDescription>
                            Vista del PDF que se imprimirá (luego se agregará el CAE). Revisa y confirma para crear la factura.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 min-h-0 px-4 py-3 flex justify-center bg-muted/30" style={{ minHeight: 520 }}>
                        {previewHtml ? (
                            <iframe
                                srcDoc={previewHtml}
                                title="Vista previa de factura"
                                className="w-full flex-1 border-0 rounded-lg bg-white shadow-sm"
                                style={{ minHeight: 480 }}
                            />
                        ) : (
                            <div className="flex items-center justify-center p-12 text-muted-foreground">
                                Cargando vista previa...
                            </div>
                        )}
                    </div>

                    <DialogFooter className="px-6 py-4 border-t bg-muted/30 space-y-3 shrink-0">
                        <div className="flex gap-3 w-full">
                            <Button
                                variant="outline"
                                onClick={() => setShowPreview(false)}
                                disabled={submitting}
                                className="flex-1"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleConfirmInvoice}
                                disabled={submitting || !previewData}
                                className="flex-1 font-bold"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {billingType === "LEGAL" ? "Creando y Autorizando..." : "Creando..."}
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Confirmar y Crear Factura
                                    </>
                                )}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

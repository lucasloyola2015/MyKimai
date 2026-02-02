"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, FileText, TrendingUp, Calendar, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getPortalDashboardData } from "@/lib/actions/portal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function ClientDashboardPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workStatus, setWorkStatus] = useState<{ active: boolean; milestone?: string } | null>(null);

    useEffect(() => {
        loadDashboardData();
        fetchWorkStatus();
        const interval = setInterval(fetchWorkStatus, 60000); // Actualizar cada minuto
        return () => clearInterval(interval);
    }, []);

    const fetchWorkStatus = async () => {
        try {
            const res = await fetch("/api/public/work-status");
            if (res.ok) {
                const status = await res.json();
                setWorkStatus(status);
            }
        } catch (e) {
            console.error("Error fetching work status:", e);
        }
    };

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            const dashboardData = await getPortalDashboardData();
            setData(dashboardData);
        } catch (err) {
            console.error("Error loading portal dashboard:", err);
            setError("No se pudo cargar el resumen del portal. Verifica tu conexión.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-8 animate-pulse">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-64" />
                        <Skeleton className="h-5 w-80" />
                    </div>
                    <Skeleton className="h-12 w-40" />
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => (
                        <Card key={i} className="h-32 bg-muted/20 border-none shadow-none" />
                    ))}
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-48 w-full" />
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h2 className="text-2xl font-bold">Error de vinculación de cuenta</h2>
                <p className="text-muted-foreground mt-2 max-w-md">
                    {error || "No se encontraron datos vinculados a tu cuenta de cliente."}
                </p>
                <Button onClick={loadDashboardData} variant="outline" className="mt-6">
                    Intentar nuevamente
                </Button>
            </div>
        );
    }

    const now = new Date();

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight">Bienvenido, {data.clientName}</h1>
                    <p className="text-muted-foreground mt-1 text-lg">
                        Resumen de actividad y facturación al {format(new Date(), "d 'de' MMMM", { locale: es })}
                    </p>
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 flex items-center gap-3">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <div>
                        <p className="text-[10px] uppercase font-bold text-primary/70 leading-none">Cotización USD Oficial</p>
                        <p className="text-xl font-mono font-bold text-primary">${data.exchangeRate.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* Live Activity Status */}
            {workStatus?.active && (
                <Card className="border-none shadow-md bg-emerald-500/5 border-l-4 border-l-emerald-500 overflow-hidden animate-in slide-in-from-top-4 duration-700">
                    <CardContent className="py-4 flex items-center gap-4">
                        <div className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-0.5">
                                El Ingeniero está trabajando en este momento en:
                            </p>
                            <p className="text-lg font-bold text-emerald-950 italic leading-tight">
                                {workStatus.milestone}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="overflow-hidden border-none shadow-lg bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 opacity-80">
                            <Clock className="h-4 w-4" />
                            Horas este Mes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{data.hoursCurrentMonth.toFixed(1)}h</div>
                        <p className="text-xs opacity-70 mt-1">
                            vs {data.hoursPreviousMonth.toFixed(1)}h el mes pasado
                        </p>
                    </CardContent>
                </Card>

                <Card className="overflow-hidden border-none shadow-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 opacity-80">
                            <AlertCircle className="h-4 w-4" />
                            Facturas Pendientes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{data.unpaidInvoices}</div>
                        <p className="text-xs opacity-70 mt-1">
                            Acción requerida para pago
                        </p>
                    </CardContent>
                </Card>

                <Card className="overflow-hidden border-none shadow-lg bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 opacity-80">
                            <FileText className="h-4 w-4" />
                            Saldo Pendiente Total
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{data.currency} {Number(data.totalUnpaidAmount).toLocaleString()}</div>
                        <p className="text-xs opacity-70 mt-1">
                            Monto total de facturas no pagas
                        </p>
                    </CardContent>
                </Card>

                <Card className="overflow-hidden border-none shadow-lg bg-muted/50 border border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            Ciclo de Facturación
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">Mensual</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Próximo cierre: {format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "dd/MM/yyyy")}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Enlaces Rápidos</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <a href="/client-portal/invoices" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors">
                            <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-blue-500" />
                                <span className="font-medium">Ver todas mis facturas</span>
                            </div>
                        </a>
                        <a href="/client-portal/projects" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors">
                            <div className="flex items-center gap-3">
                                <Clock className="h-5 w-5 text-emerald-500" />
                                <span className="font-medium">Detalle de horas por proyecto</span>
                            </div>
                        </a>
                    </CardContent>
                </Card>

                <Card className="bg-primary/5 border-primary/10">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-primary" />
                            Notas del Administrador
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Este es tu portal privado donde puedes auditar el trabajo realizado en tiempo real.
                            Si tienes dudas sobre alguna factura o registro de tiempo, por favor contacta a soporte.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div >
    );
}

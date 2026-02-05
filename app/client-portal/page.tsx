"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, FolderKanban, FileText, TrendingUp, AlertCircle } from "lucide-react";
import { format, subWeeks, addWeeks, subMonths, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { getPortalDashboardData } from "@/lib/actions/portal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
    PortalHoursChart,
    type PortalDrillLevel,
} from "@/components/client-portal/PortalHoursChart";
import { PortalProjectChart } from "@/components/client-portal/PortalProjectChart";
import Link from "next/link";

export default function ClientDashboardPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workStatus, setWorkStatus] = useState<{ active: boolean; milestone?: string } | null>(null);
    const [drillLevel, setDrillLevel] = useState<PortalDrillLevel>("month");
    const [focusRange, setFocusRange] = useState<{ start: Date; end: Date } | null>(null);

    const handleDrillDown = useCallback((range: { start: Date; end: Date }) => {
        setFocusRange(range);
        setDrillLevel((prev) =>
            prev === "month" ? "week" : prev === "week" ? "day" : "hour"
        );
    }, []);

    const handleDrillReset = useCallback(() => {
        setFocusRange(null);
        setDrillLevel("month");
    }, []);

    const handlePeriodSelect = useCallback(
        (period: "day" | "week" | "month", range?: { start: Date; end: Date }) => {
            if (period === "day" || period === "month") {
                setFocusRange(null);
                setDrillLevel("month");
            } else if (period === "week" && range) {
                setFocusRange(range);
                setDrillLevel("day");
            }
        },
        []
    );

    const handleNavigate = useCallback(
        (delta: number) => {
            setFocusRange((prev) => {
                if (!prev) return null;
                const n = Math.abs(delta) || 1;
                if (drillLevel === "week") {
                    return delta > 0
                        ? { start: addMonths(prev.start, n), end: addMonths(prev.end, n) }
                        : { start: subMonths(prev.start, n), end: subMonths(prev.end, n) };
                }
                if (drillLevel === "day") {
                    return delta > 0
                        ? { start: addWeeks(prev.start, n), end: addWeeks(prev.end, n) }
                        : { start: subWeeks(prev.start, n), end: subWeeks(prev.end, n) };
                }
                return prev;
            });
        },
        [drillLevel]
    );

    useEffect(() => {
        loadDashboardData();
        fetchWorkStatus();
        const interval = setInterval(fetchWorkStatus, 60000);
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
            <div className="space-y-6 animate-pulse">
                <div>
                    <Skeleton className="h-9 w-56 mb-1" />
                    <Skeleton className="h-4 w-72" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="border border-border bg-card">
                            <CardContent className="pt-6">
                                <Skeleton className="h-4 w-24 mb-3" />
                                <Skeleton className="h-8 w-20" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                    <Skeleton className="h-80 rounded-lg border border-border" />
                    <Skeleton className="h-80 rounded-lg border border-border" />
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h2 className="text-2xl font-bold text-foreground">Error de vinculación de cuenta</h2>
                <p className="text-muted-foreground mt-2 max-w-md">
                    {error || "No se encontraron datos vinculados a tu cuenta de cliente."}
                </p>
                <Button onClick={loadDashboardData} variant="outline" className="mt-6">
                    Intentar nuevamente
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header: limpio, sin saturados */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        {data.clientName}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Resumen al {format(new Date(), "d 'de' MMMM yyyy", { locale: es })}
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">USD Oficial</p>
                        <p className="text-sm font-mono font-semibold text-foreground">
                            {data.exchangeRate.toFixed(2)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Live: ingeniero trabajando */}
            {workStatus?.active && (
                <Card className="border-l-4 border-l-primary bg-primary/5 border-border">
                    <CardContent className="py-3 flex items-center gap-3">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                        </span>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                En curso
                            </p>
                            <p className="text-sm font-medium text-foreground">{workStatus.milestone}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tres métricas clave: paleta clean, monospace para números */}
            <div className="grid gap-4 sm:grid-cols-3">
                <Card className="border border-border bg-card shadow-sm">
                    <CardContent className="pt-5 pb-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Horas este mes
                            </span>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="mt-2 text-2xl font-mono font-bold text-foreground tabular-nums">
                            {data.hoursCurrentMonth.toFixed(1)}h
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            vs {data.hoursPreviousMonth.toFixed(1)}h mes anterior
                        </p>
                    </CardContent>
                </Card>

                <Card className="border border-border bg-card shadow-sm">
                    <CardContent className="pt-5 pb-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Proyectos activos
                            </span>
                            <FolderKanban className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="mt-2 text-2xl font-mono font-bold text-foreground tabular-nums">
                            {data.activeProjectsCount ?? 0}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            Con trabajo registrado
                        </p>
                    </CardContent>
                </Card>

                <Card className="border border-border bg-card shadow-sm">
                    <CardContent className="pt-5 pb-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Última factura
                            </span>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                        {data.lastInvoice ? (
                            <>
                                <p className="mt-2 text-2xl font-mono font-bold text-foreground tabular-nums">
                                    {data.lastInvoice.currency} {Number(data.lastInvoice.total_amount).toLocaleString()}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Última emitida
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="mt-2 text-lg font-mono text-muted-foreground">—</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Sin facturas aún
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Gráficas: drill-down sincronizado + distribución por proyecto */}
            <div className="grid gap-6 lg:grid-cols-5 items-stretch">
                <div className="lg:col-span-3 flex min-h-[420px]">
                    <PortalHoursChart
                        drillLevel={drillLevel}
                        focusRange={focusRange}
                        onDrillDown={handleDrillDown}
                        onReset={handleDrillReset}
                        onPeriodSelect={handlePeriodSelect}
                        onNavigate={handleNavigate}
                        className="flex-1 min-h-0 flex flex-col"
                    />
                </div>
                <div className="lg:col-span-2 flex min-h-[420px]">
                    <PortalProjectChart dateRange={focusRange} className="flex-1 min-h-0 flex flex-col" />
                </div>
            </div>

            {/* Enlaces rápidos: discreto */}
            <Card className="border border-border bg-card shadow-sm">
                <CardContent className="py-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                        Acceso rápido
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/client-portal/invoices"
                            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                        >
                            <FileText className="h-4 w-4" />
                            Facturación
                        </Link>
                        <Link
                            href="/client-portal/projects"
                            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                        >
                            <FolderKanban className="h-4 w-4" />
                            Proyectos
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

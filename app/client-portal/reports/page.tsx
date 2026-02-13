"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FileText, Clock, Folder, BarChart3, FileSearch } from "lucide-react";
import { format } from "date-fns";
import { formatDateTime24 } from "@/lib/date-format";
import { getProjects } from "@/lib/actions/projects";
import { getTimeEntries } from "@/lib/actions/time-entries";
import { getClientReportAnalytics, getClientBranding } from "@/lib/actions/reports";
import { getClientContext } from "@/lib/auth/server";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { PDFReport } from "@/components/reports/PDFReport";

export default function ClientReportsPage() {
    const [entries, setEntries] = useState<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [analytics, setAnalytics] = useState<{ daily: any[], projects: any[] }>({ daily: [], projects: [] });
    const [clientBranding, setClientBranding] = useState<{ name: string; logo_url: string | null } | null>(null);
    const [clientId, setClientId] = useState<string | null>(null);

    const [filters, setFilters] = useState({
        project_id: "all",
        start_date: "",
        end_date: "",
    });

    useEffect(() => {
        const init = async () => {
            // Intentar obtener el contexto del cliente (frontend friendly check - though actions will re-verify)
            // Usamos una Server Action para esto idealmente, o confiamos en las que ya llamamos.
            // Vamos a cargar los proyectos primero, lo cual nos dará una pista.
            setLoading(true);
            try {
                const projectsData = await getProjects();
                setProjects(projectsData);

                if (projectsData.length > 0) {
                    const cId = projectsData[0].client_id;
                    setClientId(cId);
                    const branding = await getClientBranding(cId);
                    setClientBranding(branding as any);
                }

                await loadEntries();
            } catch (error) {
                console.error("Error initializing reports:", error);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const loadEntries = async () => {
        setLoading(true);
        try {
            const startDate = filters.start_date
                ? new Date(`${filters.start_date}T00:00:00`)
                : undefined;
            const endDate = filters.end_date
                ? new Date(`${filters.end_date}T23:59:59`)
                : undefined;

            // El backend aplicará automáticamente el filtro de cliente basado en la sesión
            const [data, analyticsData] = await Promise.all([
                getTimeEntries({
                    projectId: filters.project_id === "all" ? undefined : filters.project_id,
                    startDate,
                    endDate,
                }),
                getClientReportAnalytics({
                    projectId: filters.project_id === "all" ? undefined : filters.project_id,
                    startDate,
                    endDate,
                })
            ]);

            setEntries(data);
            setAnalytics(analyticsData);
        } catch (error) {
            console.error("Error loading entries:", error);
            toast({
                title: "Error",
                description: "No se pudieron cargar sus registros.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const totalNetHours = (entries.reduce((sum, e) => sum + ((e as any).duration_neto || 0), 0) / 60).toFixed(2);

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Reporte de Actividad</h1>
                    <p className="text-muted-foreground">
                        Auditoría transparente de tiempos y proyectos
                    </p>
                </div>
                <div className="flex gap-2">
                    {entries.length > 0 && (
                        <PDFDownloadLink
                            document={<PDFReport entries={entries} client={clientBranding as any} totalHours={totalNetHours} />}
                            fileName={`Reporte_${clientBranding?.name || 'Cliente'}_${format(new Date(), 'yyyyMMdd')}.pdf`}
                        >
                            {((args: any) => {
                                const { loading: pdfLoading } = args;
                                return (
                                    <Button variant="default" className="gap-2 w-full md:w-auto" disabled={pdfLoading}>
                                        <FileText className="h-4 w-4" />
                                        {pdfLoading ? "Preparando..." : "Descargar PDF"}
                                    </Button>
                                );
                            }) as any}
                        </PDFDownloadLink>
                    )}
                </div>
            </div>

            <Card className="border-none shadow-sm bg-muted/30">
                <CardHeader className="pb-3 px-4 md:px-6">
                    <CardTitle className="text-base flex items-center gap-2 text-primary uppercase tracking-widest">
                        <FileSearch className="h-4 w-4" />
                        Filtros de Auditoría
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="grid gap-2">
                            <Label htmlFor="project">Proyecto</Label>
                            <Select
                                value={filters.project_id}
                                onValueChange={(value) =>
                                    setFilters({ ...filters, project_id: value })
                                }
                            >
                                <SelectTrigger className="bg-background">
                                    <SelectValue placeholder="Todos los proyectos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los proyectos</SelectItem>
                                    {projects.map((project) => (
                                        <SelectItem key={project.id} value={project.id}>
                                            {project.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="start_date">Desde</Label>
                            <Input
                                id="start_date"
                                type="date"
                                className="bg-background"
                                value={filters.start_date}
                                onChange={(e) =>
                                    setFilters({ ...filters, start_date: e.target.value })
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="end_date">Hasta</Label>
                            <Input
                                id="end_date"
                                type="date"
                                className="bg-background"
                                value={filters.end_date}
                                onChange={(e) =>
                                    setFilters({ ...filters, end_date: e.target.value })
                                }
                            />
                        </div>
                    </div>
                    <Button onClick={loadEntries} className="mt-6 w-full md:w-auto" disabled={loading}>
                        {loading ? "Sincronizando..." : "Aplicar Filtros"}
                    </Button>
                </CardContent>
            </Card>

            {/* Visual Analytics */}
            {(analytics.daily.length > 0 || analytics.projects.length > 0) && (
                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="border-none shadow-sm overflow-hidden">
                        <CardHeader className="bg-muted/10">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                <BarChart3 className="h-3 w-3" /> Distribución Diaria (Hrs)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="h-[200px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analytics.daily}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                                        <XAxis
                                            dataKey="date"
                                            fontSize={10}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => format(new Date(val), 'dd/MM')}
                                        />
                                        <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                        />
                                        <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between bg-muted/10">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                <Folder className="h-3 w-3" /> Carga por Proyecto (Hrs)
                            </CardTitle>
                            {clientBranding?.logo_url && (
                                <img src={clientBranding.logo_url} alt="Logo" className="h-6 object-contain grayscale" />
                            )}
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="h-[200px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analytics.projects} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--muted))" />
                                        <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            fontSize={10}
                                            axisLine={false}
                                            tickLine={false}
                                            width={80}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                        />
                                        <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Audit Entries */}
            <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/5">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        Registros de Tareas
                        <Badge variant="secondary" className="ml-2 font-mono text-[10px]">
                            {entries.length} ITEMS
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        {entries.length > 0 ? entries.map((entry) => (
                            <div
                                key={entry.id}
                                className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/20"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <p className="font-bold text-sm leading-tight text-foreground">
                                            {entry.task?.name}
                                        </p>
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-medium tracking-tighter">
                                            <Folder className="h-3 w-3" /> {entry.task?.project?.name}
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                        <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 bg-background border-primary/10">
                                            {(((entry as any).duration_neto || 0) / 60).toFixed(2)}H
                                        </Badge>
                                        <span className="text-[9px] text-muted-foreground font-mono">
                                            {formatDateTime24(new Date(entry.start_time))}
                                        </span>
                                    </div>
                                </div>
                                {entry.description && (
                                    <div className="mt-3 p-2.5 rounded bg-muted/30 border-l-2 border-primary/40 text-[11px] leading-relaxed text-foreground/80 italic">
                                        {entry.description}
                                    </div>
                                )}
                            </div>
                        )) : (
                            <div className="text-center py-20 bg-muted/5 rounded-xl border-2 border-dashed flex flex-col items-center justify-center">
                                <FileSearch className="h-10 w-10 text-muted-foreground/20 mb-3" />
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Sin registros para este período
                                </p>
                            </div>
                        )}
                    </div>

                    {entries.length > 0 && (
                        <div className="mt-8 border-t pt-6 flex justify-end">
                            <div className="bg-primary/5 px-6 py-4 rounded-xl border border-primary/10 text-right">
                                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Inversión Temporal Total</p>
                                <div className="flex items-baseline justify-end gap-1">
                                    <span className="text-4xl font-black text-primary font-mono tabular-nums">
                                        {totalNetHours}
                                    </span>
                                    <span className="text-lg font-bold text-primary/60 font-mono">HR</span>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

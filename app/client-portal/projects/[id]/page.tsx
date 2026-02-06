"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    ArrowLeft,
    Clock,
    Calendar,
    FolderKanban,
    CheckCircle2,
    ChevronRight,
    Search,
} from "lucide-react";
import { getPortalProjectDetail } from "@/lib/actions/projects";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DayTimeline } from "@/components/dashboard/DayTimeline";
import Link from "next/link";
import { format } from "date-fns";
import { formatTime24 } from "@/lib/date-format";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
    const { id } = params;
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterTask, setFilterTask] = useState<string>("all");

    useEffect(() => {
        loadProjectDetail();
    }, [id]);

    const loadProjectDetail = async () => {
        try {
            setLoading(true);
            const data = await getPortalProjectDetail(id);
            setProject(data);
        } catch (error) {
            console.error("Error loading project detail:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-8 animate-pulse">
                <Skeleton className="h-10 w-64" />
                <div className="grid gap-6 md:grid-cols-3">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                </div>
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <h1 className="text-2xl font-bold">Proyecto no encontrado</h1>
                <Link href="/client-portal/projects" className="mt-4">
                    <Button variant="outline">Volver a Proyectos</Button>
                </Link>
            </div>
        );
    }

    const filteredEntries = project.timeEntries.filter((entry: any) => {
        const matchesSearch = entry.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.taskName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTask = filterTask === "all" || entry.taskName === filterTask;
        return matchesSearch && matchesTask;
    });

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
            {/* Header con navegación */}
            <div className="flex flex-col gap-4">
                <Link
                    href="/client-portal/projects"
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group w-fit"
                >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">Volver a proyectos</span>
                </Link>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
                            {project.name}
                            <span className={cn(
                                "text-xs px-2 py-1 rounded-full border",
                                project.status === 'active'
                                    ? "bg-primary/10 text-primary border-primary/30 dark:bg-primary/20 dark:border-primary/40"
                                    : "bg-muted text-muted-foreground border-border"
                            )}>
                                {project.status === 'active' ? 'EN CURSO' : project.status.toUpperCase()}
                            </span>
                        </h1>
                        <p className="text-muted-foreground mt-2 text-lg italic">
                            {project.description || "Sin descripción de proyecto."}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tarjetas de Resumen (sin montos: solo horas y actividad) */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 text-primary">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider">Horas Consumidas</CardTitle>
                        <Clock className="h-5 w-5 opacity-70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-mono font-black">
                            {(project.timeEntries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0) / 60).toFixed(2)}h
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Total acumulado del proyecto</p>
                    </CardContent>
                </Card>

                <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 text-orange-600 dark:text-orange-400">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider">Última Actividad</CardTitle>
                        <Calendar className="h-5 w-5 opacity-70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">
                            {project.timeEntries.length > 0
                                ? format(new Date(project.timeEntries[0].start_time), "dd MMM yyyy", { locale: es })
                                : "Sin actividad"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Fecha del último registro de tiempo</p>
                    </CardContent>
                </Card>
            </div>

            {/* Detalle por Tareas */}
            <div className="space-y-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <FolderKanban className="h-5 w-5 text-muted-foreground" />
                    Desglose por Tarea
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {project.tasks.map((task: any) => (
                        <div key={task.id} className="p-4 rounded-xl border bg-card hover:border-primary/30 transition-all">
                            <h4 className="font-bold border-b pb-2 mb-3">{task.name}</h4>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Horas netas:</span>
                                <span className="font-mono font-bold text-primary">{task.total_hours.toFixed(2)}h</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Historial de Registros: cada jornada en un card con barra alineada a la derecha */}
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <CardTitle className="text-xl font-black uppercase tracking-tighter">Historial de Registros</CardTitle>
                    <div className="flex flex-wrap gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por descripción..."
                                className="pl-9 w-[250px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select
                            className="bg-background border border-border shadow-sm rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none text-foreground"
                            value={filterTask}
                            onChange={(e) => setFilterTask(e.target.value)}
                        >
                            <option value="all">Todas las tareas</option>
                            {project.tasks.map((t: any) => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-3">
                    {filteredEntries.map((entry: any) => {
                        const start = new Date(entry.start_time);
                        const endTime = entry.end_time ? new Date(entry.end_time) : null;
                        const endMs = endTime ? endTime.getTime() : start.getTime() + (entry.duration_minutes || 0) * 60 * 1000;
                        const end = new Date(endMs);
                        const breaks = (entry.breaks ?? []).map((b: any) => ({
                            start_time: b.start_time instanceof Date ? b.start_time : new Date(b.start_time),
                            end_time: b.end_time ? (b.end_time instanceof Date ? b.end_time : new Date(b.end_time)) : null,
                        }));
                        return (
                            <Card key={entry.id} className="border border-border shadow-sm overflow-hidden">
                                <CardContent className="p-4">
                                    <div className="flex flex-col gap-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                                <span className="font-bold">{format(start, "dd/MM/yyyy")}</span>
                                                <span className="font-mono text-muted-foreground">{formatTime24(start)} – {formatTime24(end)}</span>
                                                <span className="font-mono font-bold text-foreground">{(entry.duration_minutes / 60).toFixed(2)}h</span>
                                                {entry.is_billed ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30 dark:border-green-500/40 text-[10px] font-black uppercase">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Facturado
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 dark:border-amber-500/40 text-[10px] font-black uppercase">
                                                        Pendiente
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-black text-primary/80 uppercase tracking-tighter flex items-center gap-1">
                                                <ChevronRight className="h-3 w-3" />
                                                {entry.taskName}
                                            </span>
                                            <span className="text-muted-foreground text-sm leading-relaxed italic">
                                                {entry.description || "Sin descripción proporcionada."}
                                            </span>
                                        </div>
                                        <div className="flex justify-end">
                                            <div className="w-full max-w-md ml-auto">
                                                <DayTimeline
                                                    startTime={start}
                                                    endTime={endTime}
                                                    breaks={breaks}
                                                    compact
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {filteredEntries.length === 0 && (
                    <div className="py-20 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                        <p>No se encontraron registros de tiempo con los filtros actuales.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

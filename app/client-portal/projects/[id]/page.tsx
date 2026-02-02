"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    ArrowLeft,
    Clock,
    CircleDollarSign,
    Calendar,
    FolderKanban,
    CheckCircle2,
    ChevronRight,
    Search,
    Filter
} from "lucide-react";
import { getPortalProjectDetail } from "@/lib/actions/projects";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { format } from "date-fns";
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
                                    ? "bg-blue-500/10 text-blue-600 border-blue-200"
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

            {/* Tarjetas de Resumen */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-none shadow-md bg-white">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 text-blue-600">
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

                <Card className="border-none shadow-md bg-white">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 text-emerald-600">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider">Inversión Total</CardTitle>
                        <CircleDollarSign className="h-5 w-5 opacity-70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-mono font-black">
                            {project.currency} {Number(project.tasks.reduce((sum: number, t: any) => sum + t.total_amount, 0)).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Monto total según horas registradas</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md bg-white">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 text-orange-600">
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
                            <div className="flex justify-between items-center text-sm mb-2">
                                <span className="text-muted-foreground">Horas:</span>
                                <span className="font-mono font-bold text-blue-600">{task.total_hours.toFixed(2)}h</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Monto:</span>
                                <span className="font-mono font-bold text-emerald-600">{project.currency} {task.total_amount.toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Registro Detallado */}
            <Card className="border-none shadow-xl overflow-hidden">
                <CardHeader className="bg-muted/50 border-b space-y-4 py-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <CardTitle className="text-xl font-black uppercase tracking-tighter">Historial de Registros</CardTitle>

                        <div className="flex flex-wrap gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por descripción..."
                                    className="pl-9 w-[250px] bg-white border-none shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <select
                                className="bg-white border-none shadow-sm rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
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
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/30 text-muted-foreground border-b">
                                    <th className="px-6 py-4 text-left font-bold uppercase tracking-widest text-[10px]">Fecha</th>
                                    <th className="px-6 py-4 text-left font-bold uppercase tracking-widest text-[10px]">Tarea / Descripción</th>
                                    <th className="px-6 py-4 text-right font-bold uppercase tracking-widest text-[10px]">Tiempo</th>
                                    <th className="px-6 py-4 text-right font-bold uppercase tracking-widest text-[10px]">Monto</th>
                                    <th className="px-6 py-4 text-center font-bold uppercase tracking-widest text-[10px]">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredEntries.map((entry: any) => (
                                    <tr key={entry.id} className="hover:bg-muted/10 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="font-bold">{format(new Date(entry.start_time), "dd/MM/yyyy")}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase">{format(new Date(entry.start_time), "HH:mm")}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 max-w-md">
                                                <span className="text-xs font-black text-primary/80 uppercase tracking-tighter flex items-center gap-1">
                                                    <ChevronRight className="h-3 w-3" />
                                                    {entry.taskName}
                                                </span>
                                                <span className="text-muted-foreground leading-relaxed italic">
                                                    {entry.description || "Sin descripción proporcionada."}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                            <span className="font-mono font-bold text-base">{(entry.duration_minutes / 60).toFixed(2)}h</span>
                                        </td>
                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                            <span className="font-mono font-bold text-base text-emerald-600">
                                                {project.currency} {Number(entry.amount).toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {entry.is_billed ? (
                                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 text-[10px] font-black uppercase">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Facturado
                                                </div>
                                            ) : (
                                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black uppercase">
                                                    Pendiente
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredEntries.length === 0 && (
                        <div className="py-20 text-center text-muted-foreground border-t">
                            <p>No se encontraron registros de tiempo con los filtros actuales.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

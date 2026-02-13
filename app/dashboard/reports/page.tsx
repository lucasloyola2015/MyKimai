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
import { Download, FileText, Clock, Folder, BarChart3, Image as ImageIcon, FileSearch, Pencil, Check, X } from "lucide-react";
import { format } from "date-fns";
import { formatDateTime24 } from "@/lib/date-format";
import { getClients } from "@/lib/actions/clients";
import { getProjects } from "@/lib/actions/projects";
import { getTimeEntries } from "@/lib/actions/time-entries";
import { getClientReportAnalytics, updateEntryDescription } from "@/lib/actions/reports";
import { Textarea } from "@/components/ui/textarea";
import type { clients, projects, time_entries } from "@prisma/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import dynamic from "next/dynamic";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false }
);
import { PDFReport } from "@/components/reports/PDFReport";

export default function ReportsPage() {
  const [entries, setEntries] = useState<time_entries[]>([]);
  const [clients, setClients] = useState<clients[]>([]);
  const [projects, setProjects] = useState<projects[]>([]);
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<{ daily: any[], projects: any[] }>({ daily: [], projects: [] });
  const [selectedClient, setSelectedClient] = useState<clients | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [filters, setFilters] = useState({
    client_id: "",
    project_id: "",
    start_date: "",
    end_date: "",
  });

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    loadEntries();
  }, [filters.client_id, filters.project_id, filters.start_date, filters.end_date]);

  useEffect(() => {
    if (filters.client_id) {
      loadProjects(filters.client_id);
      setSelectedClient(clients.find(c => c.id === filters.client_id) || null);
    } else {
      setProjects([]);
      setFilters(prev => ({ ...prev, project_id: "" }));
      setSelectedClient(null);
    }
  }, [filters.client_id, clients]);

  const loadClients = async () => {
    try {
      const data = await getClients();
      setClients(data);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los clientes.",
        variant: "destructive",
      });
    }
  };

  const loadProjects = async (clientId: string) => {
    try {
      const data = await getProjects(clientId);
      setProjects(data);
    } catch (error) {
      console.error("Error loading projects:", error);
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    try {
      const startDate = filters.start_date
        ? new Date(`${filters.start_date}T00:00:00`)
        : undefined;
      const endDate = filters.end_date
        ? new Date(`${filters.end_date}T23:59:59`)
        : undefined;

      const [data, analyticsData] = await Promise.all([
        getTimeEntries({
          clientId: filters.client_id || undefined,
          projectId: filters.project_id || undefined,
          startDate,
          endDate,
        }),
        getClientReportAnalytics({
          clientId: filters.client_id || undefined,
          projectId: filters.project_id || undefined,
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
        description: "No se pudieron cargar las entradas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDescription = async (entryId: string) => {
    setIsUpdating(true);
    try {
      const result = await updateEntryDescription(entryId, editDescription);
      if (result.success) {
        toast({ title: "Éxito", description: "Descripción actualizada correctamente." });
        setEntries((prev: any[]) => prev.map(e => e.id === entryId ? { ...e, description: editDescription } : e));
        setEditingEntryId(null);
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Ocurrió un error al actualizar.", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  const totalNetHours = (entries
    .filter(e => (e as any).billable !== false)
    .reduce((sum, e) => sum + ((e as any).duration_neto || 0), 0) / 60).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reportes</h1>
          <p className="text-muted-foreground">
            Generación de PDF, Analíticas y Branding Corporativo
          </p>
        </div>
        <div className="flex gap-2">
          {isMounted && entries.length > 0 && (
            <PDFDownloadLink
              key={`${entries.length}-${filters.client_id}-${filters.project_id}-${filters.start_date}-${filters.end_date}`}
              document={<PDFReport entries={entries} client={selectedClient as any} totalHours={totalNetHours} analytics={analytics} filters={filters} />}
              fileName={`Reporte_Auditoria_${selectedClient?.name || 'Gral'}_${format(new Date(), 'yyyyMMdd')}.pdf`}
            >
              {((args: any) => {
                const { loading: pdfLoading } = args;
                return (
                  <Button variant="default" className="gap-2" disabled={pdfLoading}>
                    <FileText className="h-4 w-4" />
                    {pdfLoading ? "Preparando PDF..." : "Generar PDF"}
                  </Button>
                );
              }) as any}
            </PDFDownloadLink>
          )}
        </div>
      </div>

      <Card className="border-none shadow-sm bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-primary">
            <FileSearch className="h-5 w-5" />
            Parámetros de Auditoría
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="client">Cliente</Label>
              <Select
                value={filters.client_id || "all"}
                onValueChange={(value) =>
                  setFilters({ ...filters, client_id: value === "all" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los clientes</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="project">Proyecto</Label>
              <Select
                value={filters.project_id || "all"}
                onValueChange={(value) =>
                  setFilters({ ...filters, project_id: value === "all" ? "" : value })
                }
                disabled={!filters.client_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!filters.client_id ? "Seleccione un cliente primero" : "Todos los proyectos"} />
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
              <Label htmlFor="start_date">Fecha Inicio</Label>
              <Input
                id="start_date"
                type="date"
                value={filters.start_date}
                onChange={(e) =>
                  setFilters({ ...filters, start_date: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end_date">Fecha Fin</Label>
              <Input
                id="end_date"
                type="date"
                value={filters.end_date}
                onChange={(e) =>
                  setFilters({ ...filters, end_date: e.target.value })
                }
              />
            </div>
          </div>
          <Button onClick={loadEntries} className="mt-4" disabled={loading}>
            {loading ? "Cargando..." : "Sincronizar Datos"}
          </Button>
        </CardContent>
      </Card>

      {/* Analíticas Visuales */}
      {(analytics.daily.length > 0 || analytics.projects.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Distribución de Horas Netas (Diario)
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                      itemStyle={{ color: 'hsl(var(--primary))', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Folder className="h-4 w-4" /> Distribución por Proyecto
              </CardTitle>
              {(selectedClient as any)?.logo_url && (
                <img src={(selectedClient as any).logo_url} alt="Logo" className="h-8 object-contain" />
              )}
            </CardHeader>
            <CardContent>
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
                    <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                      {analytics.projects.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "hsl(var(--primary))" : "hsl(var(--primary)/0.6)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4 bg-muted/10">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Registros de Auditoría
            <Badge variant="secondary" className="ml-2 font-mono">
              {entries.length} ITEMS
            </Badge>
          </CardTitle>
          {selectedClient && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-muted-foreground mr-2">Branding:</span>
              {(selectedClient as any)?.logo_url ? (
                <img src={(selectedClient as any).logo_url} alt="Logo" className="h-6 object-contain grayscale hover:grayscale-0 transition-all" />
              ) : (
                <Badge variant="outline" className="font-mono text-[10px]">{selectedClient.name}</Badge>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {entries.length > 0 ? (entries as any[]).map((entry) => {
              const task = entry.tasks;
              const project = task?.projects;
              const client = project?.clients;
              const hours = (entry.duration_neto || 0) / 60;

              return (
                <div
                  key={entry.id}
                  className="rounded-lg border bg-card p-4 transition-hover hover:border-primary/30 group"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-base leading-tight flex items-center gap-2">
                          {task?.name || "Tarea sin nombre"}
                          {!entry.billable && (
                            <span className="text-[9px] font-black text-white bg-orange-600 px-2 py-0.5 rounded uppercase tracking-tighter">
                              No Facturable
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-x-3 text-muted-foreground text-[11px] font-medium uppercase tracking-tighter">
                        <span className="flex items-center gap-1">
                          <Folder className="h-3 w-3" /> {project?.name}
                        </span>
                        <span className="text-border">|</span>
                        <span>{client?.name}</span>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1.5">
                      <Badge variant="outline" className="font-mono text-sm px-3 py-1 bg-background text-primary border-primary/20 shadow-sm">
                        {(((entry as any).duration_neto || 0) / 60).toFixed(2)}H
                      </Badge>
                      <p className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                        {formatDateTime24(new Date(entry.start_time))}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    {editingEntryId === entry.id ? (
                      <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                        <Textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Escribe la descripción profesional de la tarea..."
                          className="text-xs min-h-[80px] bg-background border-primary/20 focus-visible:ring-primary/30"
                          disabled={isUpdating}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingEntryId(null)}
                            disabled={isUpdating}
                            className="h-7 text-[10px] uppercase font-bold"
                          >
                            <X className="h-3 w-3 mr-1" /> Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUpdateDescription(entry.id)}
                            disabled={isUpdating}
                            className="h-7 text-[10px] uppercase font-bold"
                          >
                            <Check className="h-3 w-3 mr-1" /> {isUpdating ? "Guardando..." : "Guardar Cambios"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="p-3 rounded-md bg-muted/30 border-l-4 border-primary text-[11px] leading-relaxed text-foreground/80 italic group/desc relative"
                        onClick={() => {
                          setEditingEntryId(entry.id);
                          setEditDescription(entry.description || "");
                        }}
                      >
                        {entry.description || <span className="text-muted-foreground/50">Sin descripción...</span>}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover/desc:opacity-100 transition-opacity bg-background/80 shadow-sm"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            }) : (
              <div className="text-center py-20 bg-muted/10 rounded-xl border-2 border-dashed flex flex-col items-center justify-center">
                <FileSearch className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">
                  Sin registros detectados
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px] leading-relaxed">
                  Ajuste los parámetros de auditoría para sincronizar los datos del período seleccionado.
                </p>
              </div>
            )}
          </div>

          {entries.length > 0 && (
            <div className="mt-10 border-t-2 border-primary/10 pt-8">
              <div className="flex flex-col items-end gap-3">
                <div className="flex items-center gap-6 text-muted-foreground font-mono text-xs uppercase tracking-widest">
                  <span>Volumen de registros:</span>
                  <span className="font-bold text-foreground">{entries.length}</span>
                </div>
                <div className="flex flex-col items-end bg-primary/5 px-8 py-6 rounded-2xl border border-primary/10 shadow-[inner_0_2px_4px_rgba(0,0,0,0.05)]">
                  <span className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-1">Tiempo Neto</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black text-primary font-mono tabular-nums">
                      {totalNetHours}
                    </span>
                    <span className="text-xl font-bold text-primary/60 font-mono">HR</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

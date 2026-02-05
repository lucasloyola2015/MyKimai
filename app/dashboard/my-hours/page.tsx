"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, Coffee, X, Wrench, ChevronRight } from "lucide-react";
import { getClients } from "@/lib/actions/clients";
import { getProjects } from "@/lib/actions/projects";
import {
  getTimeEntries,
  updateTimeEntry,
  deleteTimeEntry,
  addTimeEntryBreak,
  updateTimeEntryBreak,
  deleteTimeEntryBreak,
  previewConsolidation,
  executeConsolidation,
  recalculateTimeEntryRate,
  type ConsolidationPreview
} from "@/lib/actions/time-entries";
import { format, differenceInMinutes } from "date-fns";
import { formatTime24 } from "@/lib/date-format";
import { toast } from "@/hooks/use-toast";
import { cn, calculateNetDurationMinutes } from "@/lib/utils";
import type { clients, projects, time_entries } from "@prisma/client";
import { DayTimeline } from "@/components/dashboard/DayTimeline";

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<clients[]>([]);
  const [projects, setProjects] = useState<(projects & { client: clients })[]>([]);
  const [entries, setEntries] = useState<time_entries[]>([]);
  const [maintenancePreview, setMaintenancePreview] = useState<ConsolidationPreview[] | null>(null);
  const [isMaintenanceLoading, setIsMaintenanceLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [formData, setFormData] = useState<any>({
    description: "",
    start_date: "",
    start_time: "",
    end_date: "",
    end_time: "",
  });
  const [recalculatingIds, setRecalculatingIds] = useState<Set<string>>(new Set());
  /** Estado controlado por descanso: start/end en "HH:mm" para envío atómico (ambos siempre al servidor) */
  const [breakFormValues, setBreakFormValues] = useState<Record<string, { start: string; end: string }>>({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      loadProjects(selectedClient);
    } else {
      setProjects([]);
      setSelectedProject("");
    }
  }, [selectedClient]);

  useEffect(() => {
    loadEntries();
  }, [selectedClient, selectedProject]);

  const loadData = async () => {
    try {
      const [clientsData, entriesData] = await Promise.all([
        getClients(),
        getTimeEntries(),
      ]);
      setClients(clientsData);
      setEntries(entriesData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (clientId: string) => {
    try {
      const projectsData = await getProjects(clientId);
      setProjects(projectsData);
    } catch (error) {
      console.error("Error loading projects:", error);
    }
  };

  const loadEntries = async () => {
    try {
      const entriesData = await getTimeEntries({
        clientId: selectedClient || undefined,
        projectId: selectedProject || undefined,
      });
      setEntries(entriesData);
    } catch (error) {
      console.error("Error loading entries:", error);
    }
  };

  const filteredProjects = selectedClient
    ? projects.filter((p) => p.client_id === selectedClient)
    : [];

  const handleEdit = (entry: any) => {
    setEditingEntry(entry);
    const startDate = new Date(entry.start_time);
    const endDate = entry.end_time ? new Date(entry.end_time) : new Date();

    setFormData({
      description: entry.description || "",
      start_date: format(startDate, "yyyy-MM-dd"),
      start_time: formatTime24(startDate),
      end_date: format(endDate, "yyyy-MM-dd"),
      end_time: entry.end_time ? formatTime24(endDate) : "",
    });
    const breakValues: Record<string, { start: string; end: string }> = {};
    (entry.breaks || []).forEach((b: any) => {
      breakValues[b.id] = {
        start: formatTime24(new Date(b.start_time)),
        end: b.end_time ? formatTime24(new Date(b.end_time)) : "",
      };
    });
    setBreakFormValues(breakValues);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta entrada de tiempo?")) return;

    try {
      const result = await deleteTimeEntry(id);
      if (!result.success) {
        throw new Error(result.error);
      }
      toast({
        title: "Éxito",
        description: "Entrada de tiempo eliminada correctamente.",
      });
      loadEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al eliminar la entrada",
        variant: "destructive",
      });
    }
  };

  const handleRecalculateRate = async (id: string) => {
    setRecalculatingIds(prev => new Set(prev).add(id));
    try {
      const result = await recalculateTimeEntryRate(id);
      if (!result.success) throw new Error(result.error);

      toast({
        title: "Tarifa Recalculada",
        description: "El precio de la jornada se ha actualizado con la configuración vigente.",
      });
      await loadEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo recalcular la tarifa",
        variant: "destructive",
      });
    } finally {
      setRecalculatingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    try {
      const startDateTime = new Date(`${formData.start_date}T${formData.start_time}`);
      const endDateTime = (formData.end_date && formData.end_time && editingEntry.end_time)
        ? new Date(`${formData.end_date}T${formData.end_time}`)
        : null;

      const result = await updateTimeEntry(editingEntry.id, {
        description: formData.description || null,
        start_time: startDateTime,
        end_time: endDateTime,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: "Éxito",
        description: "Entrada de tiempo actualizada correctamente.",
      });

      setIsDialogOpen(false);
      setEditingEntry(null);
      loadEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al actualizar la entrada",
        variant: "destructive",
      });
    }
  };

  const handleAddBreak = async () => {
    if (!editingEntry) return;
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60000);
    const result = await addTimeEntryBreak(editingEntry.id, start, now);
    if (result.success) {
      await loadEntries();
      const updatedEntries = await getTimeEntries({ clientId: selectedClient || undefined, projectId: selectedProject || undefined });
      const updated = updatedEntries.find((e: any) => e.id === editingEntry.id);
      if (updated) {
        setEditingEntry(updated);
        setBreakFormValues((prev) => {
          const next = { ...prev };
          (updated.breaks || []).forEach((br: any) => {
            if (!(br.id in next))
              next[br.id] = {
                start: formatTime24(new Date(br.start_time)),
                end: br.end_time ? formatTime24(new Date(br.end_time)) : "",
              };
          });
          return next;
        });
      }
    }
  };

  const handleUpdateBreak = async (breakId: string, startTimeStr: string, endTimeStr: string) => {
    if (!editingEntry) return;
    const dateStr = formData.start_date;
    const start = new Date(`${dateStr}T${startTimeStr}`);
    const end = endTimeStr ? new Date(`${dateStr}T${endTimeStr}`) : null;

    const result = await updateTimeEntryBreak(breakId, start, end);
    if (result.success) {
      await loadEntries();
      const updatedEntries = await getTimeEntries({ clientId: selectedClient || undefined, projectId: selectedProject || undefined });
      const updated = updatedEntries.find((e: any) => e.id === editingEntry.id);
      if (updated) setEditingEntry(updated);
    }
  };

  const handleDeleteBreak = async (breakId: string) => {
    if (!confirm("¿Eliminar esta pausa?")) return;
    const result = await deleteTimeEntryBreak(breakId);
    if (result.success) {
      loadEntries();
      const updatedEntries = await getTimeEntries();
      const updated = updatedEntries.find((e: any) => e.id === editingEntry.id);
      if (updated) setEditingEntry(updated);
    }
  };
  const handlePreview = async () => {
    setIsMaintenanceLoading(true);
    try {
      const previews = await previewConsolidation();
      setMaintenancePreview(previews);
      if (previews.length === 0) {
        toast({
          title: "Limpieza",
          description: "No se encontraron registros fragmentados para consolidar.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al generar vista previa de mantenimiento",
        variant: "destructive",
      });
    } finally {
      setIsMaintenanceLoading(false);
    }
  };

  const handleExecuteConsolidation = async () => {
    setIsMaintenanceLoading(true);
    try {
      const results = await executeConsolidation();
      toast({
        title: "Éxito",
        description: `Consolidación completada: ${results.consolidated} grupos procesados, ${results.removed} registros eliminados, ${results.breaksCreated} pausas automáticas creadas.`,
      });
      setMaintenancePreview(null);
      loadEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al ejecutar consolidación de mantenimiento",
        variant: "destructive",
      });
    } finally {
      setIsMaintenanceLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      description: "",
      start_date: "",
      start_time: "",
      end_date: "",
      end_time: "",
    });
    setBreakFormValues({});
    setEditingEntry(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mis Horas</h1>
        <p className="text-muted-foreground">
          Gestiona todas tus entradas de tiempo trabajadas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="client_filter">Cliente</Label>
              <Select
                value={selectedClient || "all"}
                onValueChange={(value) => {
                  setSelectedClient(value === "all" ? "" : value);
                }}
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
              <Label htmlFor="project_filter">Proyecto</Label>
              <Select
                value={selectedProject || "all"}
                onValueChange={(value) => {
                  setSelectedProject(value === "all" ? "" : value);
                }}
                disabled={!selectedClient}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los proyectos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proyectos</SelectItem>
                  {filteredProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Herramientas de Limpieza */}
      <Card className="border-orange-200 bg-orange-50/30 overflow-hidden">
        <CardHeader className="bg-orange-100/50 pb-4">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-orange-600" />
            <CardTitle className="text-sm font-bold text-orange-800 uppercase tracking-wider">
              Herramientas de Limpieza
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {!maintenancePreview ? (
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-orange-900 font-medium">Unificador de Registros</p>
                <p className="text-xs text-orange-700/80">Busca registros del mismo cliente en el mismo día y los une creando pausas automáticas.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-white border-orange-200 hover:bg-orange-100 text-orange-700 font-bold shrink-0"
                onClick={handlePreview}
                disabled={isMaintenanceLoading}
              >
                {isMaintenanceLoading ? "Analizando..." : "Analizar Registros"}
                <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white/80 rounded-xl border border-orange-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-orange-50/50 border-b border-orange-100 text-orange-900 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-center">Fragmentos</th>
                      <th className="px-3 py-2 text-center">Pausas Nuevas</th>
                      <th className="px-3 py-2 text-right">Duración Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-50/50">
                    {maintenancePreview.map((p, i) => (
                      <tr key={i} className="hover:bg-orange-50/30 transition-colors">
                        <td className="px-3 py-2 text-orange-800 font-medium">{p.date}</td>
                        <td className="px-3 py-2 text-slate-700">{p.clientName}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-md font-bold">
                            {p.originalCount}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-slate-500">{p.newBreaksCount}</td>
                        <td className="px-3 py-2 text-right text-slate-600 font-mono">
                          {Math.floor(p.totalDuration / 60)}h {p.totalDuration % 60}m
                        </td>
                      </tr>
                    ))}
                    {maintenancePreview.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-slate-400 italic">
                          No se encontraron registros para unificar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-orange-700 font-bold hover:bg-orange-100"
                  onClick={() => setMaintenancePreview(null)}
                  disabled={isMaintenanceLoading}
                >
                  Cancelar
                </Button>
                {maintenancePreview.length > 0 && (
                  <Button
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
                    onClick={handleExecuteConsolidation}
                    disabled={isMaintenanceLoading}
                  >
                    {isMaintenanceLoading ? "Procesando..." : "Ejecutar Unificación"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Entradas de Tiempo ({entries.length} resultados)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => {
                const task = (entry as any).task;
                const project = task?.project;
                const client = project?.client;
                const activeBreak = (entry as any).breaks?.find((b: any) => b.end_time === null);

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "group relative rounded-xl border bg-white p-3 transition-all hover:border-primary/30 hover:shadow-sm",
                      !entry.end_time ? "border-primary/40 bg-primary/5" : "border-slate-200"
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* LADO IZQUIERDO: Task & Client */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-bold text-slate-900 truncate uppercase tracking-tight text-sm">
                            {task?.name || "Tarea eliminada"}
                          </h3>
                          {!entry.end_time && (
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="En curso" />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">
                          {client?.name} <span className="mx-1 text-slate-300 font-normal">|</span> {project?.name}
                        </p>
                      </div>

                      {/* CENTRO: Desglose Compacto (Cálculo) */}
                      <div className="hidden sm:flex items-center bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 gap-3">
                        <div className="text-center">
                          <p className="text-[6px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-0.5">Bruto</p>
                          <p className="text-[10px] font-mono font-medium text-slate-500 leading-none">
                            {(differenceInMinutes(entry.end_time || new Date(), entry.start_time) / 60).toFixed(2)}h
                          </p>
                        </div>
                        <div className="text-slate-300 text-[10px] font-light">-</div>
                        <div className="text-center">
                          <p className="text-[6px] font-black text-orange-400 uppercase tracking-tighter leading-none mb-0.5">Pausas</p>
                          <p className="text-[10px] font-mono font-bold text-orange-600 leading-none">
                            {((differenceInMinutes(entry.end_time || new Date(), entry.start_time) - (entry.duration_minutes || 0)) / 60).toFixed(2)}h
                          </p>
                        </div>
                        <div className="text-slate-300 text-[10px] font-light">=</div>
                        <div className="text-center min-w-[35px]">
                          <p className="text-[6px] font-black text-blue-400 uppercase tracking-tighter leading-none mb-0.5">Neto</p>
                          <p className="text-[11px] font-mono font-black text-blue-700 leading-none">
                            {((entry.duration_minutes || 0) / 60).toFixed(2)}h
                          </p>
                        </div>
                      </div>

                      {/* LADO DERECHO: Inversión y Acciones */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="mr-2 text-right hidden md:block">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Inversión</p>
                          <p className="text-sm font-black text-slate-800 leading-none">
                            {recalculatingIds.has(entry.id) ? (
                              <span className="animate-pulse text-blue-600">??.??</span>
                            ) : (
                              Number(entry.amount || 0).toFixed(2)
                            )} <span className="text-[9px] font-medium opacity-40">{project?.currency}</span>
                          </p>
                        </div>
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(entry)}
                            className="h-8 w-8 rounded-none hover:bg-white text-slate-400 hover:text-primary transition-colors border-r"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRecalculateRate(entry.id)}
                            className="h-8 w-8 rounded-none hover:bg-white text-slate-400 hover:text-blue-600 transition-colors border-r"
                            disabled={entry.is_billed}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" className="bi bi-currency-exchange" viewBox="0 0 16 16">
                              <path d="M0 5a5 5 0 0 0 4.027 4.905 6.5 6.5 0 0 1 .544-2.073C3.695 7.536 3.132 6.864 3 5.91h-.5v-.426h.466V5.05q-.001-.07.004-.135H2.5v-.427h.511C3.236 3.24 4.213 2.5 5.681 2.5c.316 0 .59.031.819.085v.733a3.5 3.5 0 0 0-.815-.082c-.919 0-1.538.466-1.734 1.252h1.917v.427h-1.98q-.004.07-.003.147v.422h1.983v.427H3.93c.118.602.468 1.03 1.005 1.229a6.5 6.5 0 0 1 4.97-3.113A5.002 5.002 0 0 0 0 5m16 5.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0m-7.75 1.322c.069.835.746 1.485 1.964 1.562V14h.54v-.62c1.259-.086 1.996-.74 1.996-1.69 0-.865-.563-1.31-1.57-1.54l-.426-.1V8.374c.54.06.884.347.966.745h.948c-.07-.804-.779-1.433-1.914-1.502V7h-.54v.629c-1.076.103-1.808.732-1.808 1.622 0 .787.544 1.288 1.45 1.493l.358.085v1.78c-.554-.08-.92-.376-1.003-.787zm1.96-1.895c-.532-.12-.82-.364-.82-.732 0-.41.311-.719.824-.809v1.54h-.005zm.622 1.044c.645.145.943.38.943.796 0 .474-.37.8-1.02.86v-1.674z" />
                            </svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(entry.id)}
                            className="h-8 w-8 rounded-none hover:bg-white text-slate-400 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* LÍNEA DE TIEMPO (Solo se muestra el componente) */}
                    <div className="mt-2">
                      <DayTimeline
                        startTime={new Date(entry.start_time)}
                        endTime={entry.end_time ? new Date(entry.end_time) : null}
                        breaks={(entry as any).breaks}
                      />
                    </div>
                  </div>
                );
              })}

              {entries.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    No hay entradas de tiempo que coincidan con los filtros.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Entrada de Tiempo</DialogTitle>
            <DialogDescription>
              Modifica los detalles , incluyendo pausas registradas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Descripción de la tarea realizada..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="start_date">Fecha Inicio</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) =>
                      setFormData({ ...formData, start_date: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="start_time">Hora Inicio</Label>
                  <Input
                    id="start_time"
                    type="time"
                    value={formData.start_time}
                    onChange={(e) =>
                      setFormData({ ...formData, start_time: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b pb-4">
                <div className="grid gap-2">
                  <Label htmlFor="end_date">Fecha Fin</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) =>
                      setFormData({ ...formData, end_date: e.target.value })
                    }
                    required={!!editingEntry?.end_time}
                    disabled={!editingEntry?.end_time}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end_time">Hora Fin</Label>
                  <Input
                    id="end_time"
                    type="time"
                    value={formData.end_time}
                    onChange={(e) =>
                      setFormData({ ...formData, end_time: e.target.value })
                    }
                    required={!!editingEntry?.end_time}
                    disabled={!editingEntry?.end_time}
                    placeholder={!editingEntry?.end_time ? "En progreso..." : ""}
                  />
                </div>
              </div>

              {/* Sección de Pausas */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-amber-600">
                    <Coffee className="h-4 w-4" />
                    Pausas / Descansos
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleAddBreak}
                  >
                    <Plus className="h-3 w-3" /> Añadir Pausa
                  </Button>
                </div>

                <div className="space-y-2">
                  {editingEntry?.breaks?.length > 0 ? (
                    editingEntry.breaks.map((b: any) => {
                      const breakVal = breakFormValues[b.id] ?? {
                        start: formatTime24(new Date(b.start_time)),
                        end: b.end_time ? formatTime24(new Date(b.end_time)) : "",
                      };
                      return (
                        <div key={b.id} className="flex items-center gap-2 bg-muted/50 p-2 rounded-md">
                          <Input
                            type="time"
                            value={breakVal.start}
                            className="h-8 text-xs"
                            onChange={(e) =>
                              setBreakFormValues((prev) => ({
                                ...prev,
                                [b.id]: { ...(prev[b.id] ?? breakVal), start: e.target.value },
                              }))
                            }
                            onBlur={(e) =>
                              handleUpdateBreak(b.id, e.target.value, breakFormValues[b.id]?.end ?? breakVal.end)
                            }
                          />
                          <span className="text-muted-foreground text-xs">→</span>
                          <Input
                            type="time"
                            value={breakVal.end}
                            className="h-8 text-xs"
                            placeholder="En curso"
                            disabled={!b.end_time}
                            onChange={(e) =>
                              setBreakFormValues((prev) => ({
                                ...prev,
                                [b.id]: { ...(prev[b.id] ?? breakVal), end: e.target.value },
                              }))
                            }
                            onBlur={(e) =>
                              handleUpdateBreak(b.id, breakFormValues[b.id]?.start ?? breakVal.start, e.target.value)
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDeleteBreak(b.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2 italic">
                      No hay pausas registradas en esta sesión.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit">Guardar Cambios</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

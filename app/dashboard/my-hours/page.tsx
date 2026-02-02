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
  type ConsolidationPreview
} from "@/lib/actions/time-entries";
import { format, differenceInMinutes } from "date-fns";
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
      start_time: format(startDate, "HH:mm"),
      end_date: format(endDate, "yyyy-MM-dd"),
      end_time: entry.end_time ? format(endDate, "HH:mm") : "",
    });
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
    // Hora por defecto: hace 5 minutos hasta ahora
    const start = new Date(now.getTime() - 5 * 60000);
    const result = await addTimeEntryBreak(editingEntry.id, start, now);
    if (result.success) {
      loadEntries();
      // Recargar el editingEntry localmente para ver la nueva pausa
      const updatedEntries = await getTimeEntries();
      const updated = updatedEntries.find((e: any) => e.id === editingEntry.id);
      if (updated) setEditingEntry(updated);
    }
  };

  const handleUpdateBreak = async (breakId: string, startTimeStr: string, endTimeStr: string) => {
    if (!editingEntry) return;
    const dateStr = formData.start_date; // Usamos la misma fecha que el entry por defecto
    const start = new Date(`${dateStr}T${startTimeStr}`);
    const end = endTimeStr ? new Date(`${dateStr}T${endTimeStr}`) : null;

    await updateTimeEntryBreak(breakId, start, end);
    loadEntries();
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
                      "rounded-lg border p-4 text-sm transition-all",
                      !entry.end_time ? "border-primary/50 bg-primary/5 shadow-sm" : ""
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium">
                          {task?.name || "Tarea eliminada"}
                        </p>
                        <p className="text-muted-foreground">
                          {client?.name} - {project?.name}
                        </p>
                        {!entry.end_time && (
                          <div className="flex items-center gap-2 mt-1">
                            {activeBreak ? (
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                                <span className="mr-1 h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                                PAUSADO
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                                <span className="mr-1 h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                EN CURSO
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4 text-right">
                        <div className="flex flex-col items-end shrink-0">
                          <div className="flex items-center gap-1.5 font-mono text-xs md:text-sm bg-muted/30 px-2 py-1 rounded-md border border-border/50">
                            <span className="text-muted-foreground" title="Jornada Bruta">
                              {(differenceInMinutes(entry.end_time || new Date(), entry.start_time) / 60).toFixed(2)} h
                            </span>
                            <span className="text-muted-foreground/30">-</span>
                            <span className="text-orange-500 font-medium" title="Pausas">
                              {((differenceInMinutes(entry.end_time || new Date(), entry.start_time) - (entry.duration_minutes || 0)) / 60).toFixed(2)} h
                            </span>
                            <span className="text-muted-foreground/30">=</span>
                            <span className="text-blue-600 font-bold" title="Total Facturable">
                              {((entry.duration_minutes || 0) / 60).toFixed(2)} h
                            </span>
                          </div>
                          {entry.amount && (
                            <div className="text-[10px] font-bold text-muted-foreground/70 mt-1 mr-1 uppercase tracking-widest">
                              {Number(entry.amount).toFixed(2)} {project?.currency || ""}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(entry)}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(entry.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {entry.description && (
                      <p className="text-muted-foreground">{entry.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(entry.start_time), "dd/MM/yyyy HH:mm")}
                      {entry.end_time ? (
                        ` - ${format(new Date(entry.end_time), "HH:mm")}`
                      ) : (
                        <span className="ml-1 text-primary italic">(En progreso...)</span>
                      )}
                    </p>

                    <DayTimeline
                      startTime={new Date(entry.start_time)}
                      endTime={entry.end_time ? new Date(entry.end_time) : null}
                      breaks={(entry as any).breaks}
                    />
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
                    editingEntry.breaks.map((b: any) => (
                      <div key={b.id} className="flex items-center gap-2 bg-muted/50 p-2 rounded-md">
                        <Input
                          type="time"
                          defaultValue={format(new Date(b.start_time), "HH:mm")}
                          className="h-8 text-xs"
                          onBlur={(e) => handleUpdateBreak(b.id, e.target.value, format(new Date(b.end_time || b.start_time), "HH:mm"))}
                        />
                        <span className="text-muted-foreground text-xs">→</span>
                        <Input
                          type="time"
                          defaultValue={b.end_time ? format(new Date(b.end_time), "HH:mm") : ""}
                          className="h-8 text-xs"
                          placeholder="En curso"
                          disabled={!b.end_time}
                          onBlur={(e) => handleUpdateBreak(b.id, format(new Date(b.start_time), "HH:mm"), e.target.value)}
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
                    ))
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

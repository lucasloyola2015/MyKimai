"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2 } from "lucide-react";
import type { Database } from "@/lib/types/database";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DateTimePicker } from "@/components/ui/date-time-picker";

type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

interface TimeEntryWithRelations extends TimeEntry {
  tasks?: Task & {
    projects?: Project & {
      clients?: Client;
    };
  };
}

export default function MyHoursPage() {
  const [entries, setEntries] = useState<TimeEntryWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithRelations | null>(null);
  const supabase = createClientComponentClient();

  const [filters, setFilters] = useState({
    client_id: "",
    project_id: "",
    start_date: "",
    end_date: "",
  });

  const [formData, setFormData] = useState({
    description: "",
    start_time: null as Date | null,
    end_time: null as Date | null,
    duration_minutes: "",
    billable: true,
  });

  useEffect(() => {
    loadClients();
    loadProjects();
    loadEntries();
  }, []);

  useEffect(() => {
    loadEntries();
  }, [filters]);

  const loadClients = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("name");

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error loading clients:", error);
    }
  };

  const loadProjects = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("projects")
        .select("*, clients(*)")
        .eq("clients.user_id", user.id)
        .order("name");

      if (error) throw error;
      setProjects((data as any) || []);
    } catch (error) {
      console.error("Error loading projects:", error);
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      let query = supabase
        .from("time_entries")
        .select("*, tasks(name, id, projects(name, id, clients(name, id)))")
        .eq("user_id", user.id)
        .not("end_time", "is", null) // Solo entradas completadas
        .order("start_time", { ascending: false });

      if (filters.start_date) {
        query = query.gte("start_time", `${filters.start_date}T00:00:00`);
      }

      if (filters.end_date) {
        query = query.lte("start_time", `${filters.end_date}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;

      let filteredData = (data || []) as TimeEntryWithRelations[];

      // Filtrar por cliente
      if (filters.client_id) {
        filteredData = filteredData.filter((entry: any) => {
          return entry.tasks?.projects?.clients?.id === filters.client_id;
        });
      }

      // Filtrar por proyecto
      if (filters.project_id) {
        filteredData = filteredData.filter((entry: any) => {
          return entry.tasks?.projects?.id === filters.project_id;
        });
      }

      setEntries(filteredData);
    } catch (error) {
      console.error("Error loading entries:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (entry: TimeEntryWithRelations) => {
    setEditingEntry(entry);
    setFormData({
      description: entry.description || "",
      start_time: entry.start_time ? new Date(entry.start_time) : null,
      end_time: entry.end_time ? new Date(entry.end_time) : null,
      duration_minutes: entry.duration_minutes?.toString() || "",
      billable: entry.billable ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta entrada de tiempo?")) return;

    try {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);

      if (error) throw error;
      loadEntries();
    } catch (error) {
      console.error("Error deleting entry:", error);
      alert("Error al eliminar la entrada");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingEntry || !formData.start_time || !formData.end_time) {
      alert("Por favor completa las fechas de inicio y fin");
      return;
    }

    try {
      const startTime = formData.start_time;
      const endTime = formData.end_time;
      const durationMinutes = Math.floor(
        (endTime.getTime() - startTime.getTime()) / (1000 * 60)
      );

      if (durationMinutes < 1) {
        alert("La duración debe ser al menos 1 minuto");
        return;
      }

      // Recalcular rate y amount si es necesario
      const { getRateContext, resolveRate } = await import("@/lib/utils/rates");
      const rateContext = await getRateContext(editingEntry.task_id);
      const rate = resolveRate(rateContext);

      const updateData = {
        description: formData.description || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: durationMinutes,
        billable: formData.billable,
        rate_applied: rate,
        amount: rate ? (durationMinutes / 60) * rate : null,
      };

      const { error } = await supabase
        .from("time_entries")
        .update(updateData)
        .eq("id", editingEntry.id);

      if (error) throw error;

      setIsDialogOpen(false);
      setEditingEntry(null);
      loadEntries();
    } catch (error) {
      console.error("Error updating entry:", error);
      alert("Error al actualizar la entrada");
    }
  };

  const formatTime = (minutes: number | null): string => {
    if (!minutes) return "0:00";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, "0")}`;
  };

  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return "-";
    return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: es });
  };

  // Filtrar proyectos según el cliente seleccionado
  const filteredProjects = filters.client_id
    ? projects.filter((p: any) => p.clients?.id === filters.client_id)
    : projects;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mis Horas</h1>
        <p className="text-muted-foreground">
          Gestiona todas tus entradas de tiempo trabajadas
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="client_filter">Cliente</Label>
              <Select
                value={filters.client_id || "all"}
                onValueChange={(value) => {
                  setFilters({ ...filters, client_id: value === "all" ? "" : value, project_id: "" });
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
                value={filters.project_id || "all"}
                onValueChange={(value) => {
                  setFilters({ ...filters, project_id: value === "all" ? "" : value });
                }}
                disabled={!filters.client_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los proyectos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proyectos</SelectItem>
                  {filteredProjects.map((project: any) => (
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
        </CardContent>
      </Card>

      {/* Lista de entradas */}
      {loading ? (
        <div>Cargando...</div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const task = entry.tasks;
            const project = task?.projects;
            const client = project?.clients;

            return (
              <Card key={entry.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-lg">
                        {formatDateTime(entry.start_time)}
                      </span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {client?.name} → {project?.name} → {task?.name}
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(entry)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duración:</span>
                      <span className="font-medium">
                        {formatTime(entry.duration_minutes)}
                      </span>
                    </div>
                    {entry.description && (
                      <div>
                        <span className="text-muted-foreground">Descripción: </span>
                        <span>{entry.description}</span>
                      </div>
                    )}
                    {entry.rate_applied && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tarifa:</span>
                        <span className="font-medium">
                          ${entry.rate_applied.toFixed(2)}/h
                        </span>
                      </div>
                    )}
                    {entry.amount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Monto:</span>
                        <span className="font-medium">
                          ${entry.amount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Facturable:</span>
                      <span className="font-medium">
                        {entry.billable ? "Sí" : "No"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {entries.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No hay entradas de tiempo registradas con los filtros seleccionados.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Dialog de edición */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Entrada de Tiempo</DialogTitle>
            <DialogDescription>
              Modifica los detalles de esta entrada de tiempo
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="¿Qué trabajo realizaste?"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DateTimePicker
                  label="Fecha y Hora Inicio"
                  date={formData.start_time}
                  onDateChange={(date) => {
                    setFormData({ ...formData, start_time: date });
                    // Recalcular duración
                    if (date && formData.end_time) {
                      const minutes = Math.floor(
                        (formData.end_time.getTime() - date.getTime()) / (1000 * 60)
                      );
                      setFormData((prev) => ({
                        ...prev,
                        duration_minutes: minutes > 0 ? minutes.toString() : "",
                      }));
                    }
                  }}
                  required
                />

                <DateTimePicker
                  label="Fecha y Hora Fin"
                  date={formData.end_time}
                  onDateChange={(date) => {
                    setFormData({ ...formData, end_time: date });
                    // Recalcular duración
                    if (formData.start_time && date) {
                      const minutes = Math.floor(
                        (date.getTime() - formData.start_time.getTime()) / (1000 * 60)
                      );
                      setFormData((prev) => ({
                        ...prev,
                        duration_minutes: minutes > 0 ? minutes.toString() : "",
                      }));
                    }
                  }}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="duration">Duración (minutos)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={formData.duration_minutes}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Se calcula automáticamente según las fechas de inicio y fin
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="billable"
                  checked={formData.billable}
                  onChange={(e) =>
                    setFormData({ ...formData, billable: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                <Label htmlFor="billable" className="cursor-pointer">
                  Facturable
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setEditingEntry(null);
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

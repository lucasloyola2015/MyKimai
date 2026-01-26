"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Play, Square, Clock } from "lucide-react";
import type { Database } from "@/lib/types/database";
import { getRateContext, resolveRate } from "@/lib/utils/rates";
import { format, differenceInMinutes } from "date-fns";
import { useActiveTimeEntry } from "@/contexts/active-time-entry-context";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];

interface TaskWithRelations extends Task {
  projects: Project & { clients: Client };
}

type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

export default function TimeTrackerPage() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [recentEntries, setRecentEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [preloaded, setPreloaded] = useState(false);
  const supabase = createClientComponentClient();
  const { activeEntry, refreshActiveEntry } = useActiveTimeEntry();

  // Determinar si hay una tarea activa
  const isTracking = activeEntry !== null;
  const startTime = activeEntry ? new Date(activeEntry.start_time) : null;

  useEffect(() => {
    loadClients();
    loadRecentEntries();
    refreshActiveEntry();

    // Update current time every second
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Precargar datos desde query parameters
  useEffect(() => {
    const clientId = searchParams.get("client_id");
    const projectId = searchParams.get("project_id");
    const taskId = searchParams.get("task_id");

    if (clientId && projectId && taskId && !preloaded && !activeEntry && clients.length > 0) {
      const preloadData = async () => {
        // Establecer los valores
        setSelectedClientId(clientId);
        setSelectedProjectId(projectId);
        setSelectedTaskId(taskId);
        setDescription(""); // Sin descripción como pidió el usuario
        
        // Cargar proyectos y tareas
        await loadProjects(clientId);
        await loadTasks(projectId);
        
        setPreloaded(true);
      };

      preloadData();
    }
  }, [searchParams, preloaded, activeEntry, clients.length]);

  // Cargar datos de la tarea activa cuando se detecta
  useEffect(() => {
    if (activeEntry) {
      // Buscar el cliente y proyecto de la tarea activa
      const loadActiveTaskData = async () => {
        try {
          const { data: taskData } = await supabase
            .from("tasks")
            .select("*, projects(*, clients(*))")
            .eq("id", activeEntry.task_id)
            .single();

          if (taskData) {
            const project = (taskData as any).projects;
            const client = project?.clients;
            
            if (client && project) {
              setSelectedClientId(client.id);
              setSelectedProjectId(project.id);
              setSelectedTaskId(activeEntry.task_id);
              setDescription(activeEntry.description || "");
              
              // Cargar proyectos y tareas para los selects
              await loadProjects(client.id);
              await loadTasks(project.id);
            }
          }
        } catch (error) {
          console.error("Error loading active task data:", error);
        }
      };

      loadActiveTaskData();
    } else {
      // Resetear cuando no hay tarea activa, pero solo si no hay query params para precargar
      const hasQueryParams = searchParams.get("client_id") && searchParams.get("project_id") && searchParams.get("task_id");
      if (!isTracking && !hasQueryParams && !preloaded) {
        setSelectedClientId("");
        setSelectedProjectId("");
        setSelectedTaskId("");
        setDescription("");
      }
    }
  }, [activeEntry?.id, searchParams, preloaded, isTracking]);

  useEffect(() => {
    if (selectedClientId) {
      loadProjects(selectedClientId);
    } else {
      setProjects([]);
      setSelectedProjectId("");
    }
  }, [selectedClientId]);

  useEffect(() => {
    if (selectedProjectId) {
      loadTasks(selectedProjectId);
    } else {
      setTasks([]);
      setSelectedTaskId("");
    }
  }, [selectedProjectId]);

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
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (clientId: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("client_id", clientId)
        .order("name");

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error("Error loading projects:", error);
    }
  };

  const loadTasks = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, projects(*, clients(*))")
        .eq("project_id", projectId)
        .order("name");

      if (error) throw error;
      setTasks((data as TaskWithRelations[]) || []);
    } catch (error) {
      console.error("Error loading tasks:", error);
    }
  };

  const loadRecentEntries = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("time_entries")
        .select("*, tasks(name, projects(name, clients(name)))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentEntries((data as any) || []);
    } catch (error) {
      console.error("Error loading recent entries:", error);
    }
  };

  const calculateElapsedTime = (): number => {
    if (!startTime) return 0;
    const elapsed = differenceInMinutes(currentTime, startTime);
    return elapsed;
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  };

  const handleStart = async () => {
    if (!selectedTaskId) {
      alert("Por favor selecciona una tarea");
      return;
    }

    if (activeEntry) {
      alert("Ya hay una tarea en curso. Detén la tarea actual antes de iniciar una nueva.");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Crear entrada de tiempo sin end_time
      const entryData = {
        user_id: user.id,
        task_id: selectedTaskId,
        description: description || null,
        start_time: new Date().toISOString(),
        end_time: null,
        billable: true,
      };

      const { error } = await supabase.from("time_entries").insert(entryData);

      if (error) throw error;

      // Refrescar la entrada activa
      await refreshActiveEntry();
    } catch (error) {
      console.error("Error starting time entry:", error);
      alert("Error al iniciar la tarea");
    }
  };

  const handleStop = async () => {
    if (!activeEntry) return;

    const totalMinutes = calculateElapsedTime();
    if (totalMinutes < 1) {
      alert("El tiempo debe ser al menos 1 minuto");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Get rate context
      const rateContext = await getRateContext(activeEntry.task_id);
      const rate = resolveRate(rateContext);

      const endTime = new Date();
      const { error } = await supabase
        .from("time_entries")
        .update({
          end_time: endTime.toISOString(),
          duration_minutes: totalMinutes,
          rate_applied: rate,
          amount: rate ? (totalMinutes / 60) * rate : null,
        })
        .eq("id", activeEntry.id);

      if (error) throw error;

      // Refrescar la entrada activa (debería ser null ahora)
      await refreshActiveEntry();
      loadRecentEntries();
      alert("Período de trabajo guardado exitosamente");
    } catch (error) {
      console.error("Error stopping time entry:", error);
      alert("Error al guardar el período de trabajo");
    }
  };

  const elapsedMinutes = calculateElapsedTime();
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Time Tracker</h1>
        <p className="text-muted-foreground">
          Registra el tiempo trabajado en tus tareas
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Control de Tiempo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="client">Cliente *</Label>
              <Select
                value={selectedClientId}
                onValueChange={(value) => {
                  setSelectedClientId(value);
                  setSelectedProjectId("");
                  setSelectedTaskId("");
                }}
                disabled={isTracking}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClientId && (
              <div className="grid gap-2">
                <Label htmlFor="project">Proyecto *</Label>
                <Select
                  value={selectedProjectId}
                  onValueChange={(value) => {
                    setSelectedProjectId(value);
                    setSelectedTaskId("");
                  }}
                  disabled={isTracking || !selectedClientId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedProjectId && (
              <div className="grid gap-2">
                <Label htmlFor="task">Tarea *</Label>
                <Select
                  value={selectedTaskId}
                  onValueChange={setSelectedTaskId}
                  disabled={isTracking || !selectedProjectId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una tarea" />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedTask && (
              <div className="rounded-lg border bg-muted p-3 text-sm">
                <p>
                  <strong>Cliente:</strong> {selectedTask.projects.clients.name}
                </p>
                <p>
                  <strong>Proyecto:</strong> {selectedTask.projects.name}
                </p>
                <p>
                  <strong>Tarea:</strong> {selectedTask.name}
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={description}
                onChange={async (e) => {
                  const newDescription = e.target.value;
                  setDescription(newDescription);
                  // Actualizar la descripción en la entrada activa si existe
                  if (activeEntry) {
                    await supabase
                      .from("time_entries")
                      .update({ description: newDescription || null })
                      .eq("id", activeEntry.id);
                    // Refrescar el contexto para que la navegación tenga la info actualizada
                    await refreshActiveEntry();
                  }
                }}
                placeholder="¿Qué estás haciendo?"
                disabled={isTracking}
              />
            </div>

            <div className="flex items-center justify-center space-x-4 rounded-lg border bg-muted p-6">
              <Clock className="h-8 w-8" />
              <div className="text-center">
                <div className="text-4xl font-bold">
                  {formatTime(elapsedMinutes)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {isTracking ? "En progreso" : "Detenido"}
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              {!isTracking ? (
                <Button
                  onClick={handleStart}
                  disabled={!selectedTaskId}
                  className="flex-1"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Iniciar
                </Button>
              ) : (
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  className="flex-1"
                >
                  <Square className="mr-2 h-4 w-4" />
                  Finalizar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Períodos Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No hay períodos registrados
              </p>
            ) : (
              <div className="space-y-4">
                {recentEntries.map((entry: any) => {
                  const task = entry.tasks;
                  const project = task?.projects;
                  const client = project?.clients;
                  return (
                    <div
                      key={entry.id}
                      className="rounded-lg border p-4 text-sm"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">
                          {task?.name || "Tarea eliminada"}
                        </p>
                        <p className="text-muted-foreground">
                          {entry.duration_minutes} min
                        </p>
                      </div>
                      {project && (
                        <p className="text-muted-foreground text-xs">
                          {project.name} - {client?.name}
                        </p>
                      )}
                      {entry.description && (
                        <p className="mt-2 text-muted-foreground">
                          {entry.description}
                        </p>
                      )}
                      {entry.amount && (
                        <p className="mt-2 font-medium">
                          {entry.amount.toFixed(2)} {project?.currency || ""}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {format(new Date(entry.start_time), "dd/MM/yyyy HH:mm")}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { Play, Square, Clock, Pause } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { useActiveTimeEntry } from "@/contexts/active-time-entry-context";
import { getClients } from "@/lib/actions/clients";
import { getProjects } from "@/lib/actions/projects";
import { getTaskWithRelations } from "@/lib/actions/tasks";
import {
  startTimeEntry,
  stopTimeEntry,
  updateTimeEntryDescription,
  getRecentTimeEntries,
} from "@/lib/actions/time-entries";
import type { clients, projects, tasks, time_entries } from "@prisma/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TaskWithRelations extends tasks {
  project: projects & { client: clients };
}

export default function TimeTrackerPage() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<clients[]>([]);
  const [projects, setProjects] = useState<(projects & { client: clients })[]>([]);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [recentEntries, setRecentEntries] = useState<time_entries[]>([]);
  const [loading, setLoading] = useState(true);
  const [preloaded, setPreloaded] = useState(false);
  const { activeEntry, refreshActiveEntry, pauseActiveEntry, resumeActiveEntry } = useActiveTimeEntry();

  // Determinar si hay una tarea activa
  const isTracking = activeEntry !== null;
  const startTime = activeEntry ? new Date(activeEntry.start_time) : null;

  // Determinar si hay una pausa activa
  const activeBreak = activeEntry?.breaks?.find(b => b.end_time === null);
  const isPaused = !!activeBreak;
  const [isPausing, setIsPausing] = useState(false);

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
          const taskData = await getTaskWithRelations(activeEntry.task_id);

          if (taskData) {
            const project = taskData.project;
            const client = project?.client;

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
      const data = await getClients();
      setClients(data);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los clientes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (clientId: string) => {
    try {
      const data = await getProjects(clientId);
      setProjects(data);
    } catch (error) {
      console.error("Error loading projects:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los proyectos.",
        variant: "destructive",
      });
    }
  };

  const loadTasks = async (projectId: string) => {
    try {
      const { getTasks } = await import("@/lib/actions/tasks");
      const allTasks = await getTasks(projectId);
      setTasks(allTasks as TaskWithRelations[]);
    } catch (error) {
      console.error("Error loading tasks:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las tareas.",
        variant: "destructive",
      });
    }
  };

  const loadRecentEntries = async () => {
    try {
      const data = await getRecentTimeEntries(10);
      setRecentEntries(data);
    } catch (error) {
      console.error("Error loading recent entries:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las entradas recientes.",
        variant: "destructive",
      });
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
      toast({
        title: "Error",
        description: "Por favor selecciona una tarea",
        variant: "destructive",
      });
      return;
    }

    if (activeEntry) {
      toast({
        title: "Error",
        description: "Ya hay una tarea en curso. Detén la tarea actual antes de iniciar una nueva.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await startTimeEntry(selectedTaskId, description || undefined);

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: "Éxito",
        description: "Timer iniciado correctamente.",
      });

      // Refrescar la entrada activa
      await refreshActiveEntry();
    } catch (error) {
      console.error("Error starting time entry:", error);
      toast({
        title: "Error",
        description: "Error al iniciar la tarea",
        variant: "destructive",
      });
    }
  };

  const handleStop = async () => {
    if (!activeEntry) return;

    try {
      await stopTimeEntry(activeEntry.id);

      toast({
        title: "Éxito",
        description: "Período de trabajo guardado exitosamente",
      });

      // Refrescar la entrada activa (debería ser null ahora)
      await refreshActiveEntry();
      loadRecentEntries();
    } catch (error) {
      console.error("Error stopping time entry:", error);
      toast({
        title: "Error",
        description: "Error al guardar el período de trabajo",
        variant: "destructive",
      });
    }
  };

  const handlePauseToggle = async () => {
    if (!activeEntry) return;

    setIsPausing(true);
    try {
      if (isPaused) {
        await resumeActiveEntry();
        toast({
          title: "Reanudado",
          description: "Continuando registro de tiempo.",
        });
      } else {
        await pauseActiveEntry();
        toast({
          title: "Pausado",
          description: "El tiempo de pausa no se contará en el neto.",
        });
      }
    } catch (error) {
      console.error("Error toggling pause:", error);
    } finally {
      setIsPausing(false);
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
                  <strong>Cliente:</strong> {selectedTask.project.client.name}
                </p>
                <p>
                  <strong>Proyecto:</strong> {selectedTask.project.name}
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
                    const result = await updateTimeEntryDescription(
                      activeEntry.id,
                      newDescription || null
                    );
                    if (result.success) {
                      // Refrescar el contexto para que la navegación tenga la info actualizada
                      await refreshActiveEntry();
                    }
                  }
                }}
                placeholder="¿Qué estás haciendo?"
                disabled={isTracking}
              />
            </div>

            <div className={cn(
              "flex items-center justify-center space-x-4 rounded-lg border p-6 transition-colors duration-300",
              isPaused ? "bg-amber-50 border-amber-200" : "bg-muted"
            )}>
              <Clock className={cn("h-8 w-8", isPaused && "text-amber-500 animate-pulse")} />
              <div className="text-center">
                <div className={cn(
                  "text-4xl font-bold font-mono",
                  isPaused && "text-amber-600"
                )}>
                  {formatTime(elapsedMinutes)}
                </div>
                <div className={cn(
                  "text-sm font-medium",
                  isPaused ? "text-amber-600 animate-pulse" : "text-muted-foreground"
                )}>
                  {isPaused ? "EN PAUSA" : (isTracking ? "En progreso" : "Detenido")}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {!isTracking ? (
                <Button
                  onClick={handleStart}
                  disabled={!selectedTaskId || loading}
                  className="flex-1 font-bold h-11"
                >
                  <Play className="mr-2 h-5 w-5 fill-current" />
                  INICIAR JORNADA
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleStop}
                    variant="destructive"
                    className="flex-1 font-bold h-11"
                    disabled={isPausing}
                  >
                    <Square className="mr-2 h-5 w-5 fill-current" />
                    FINALIZAR
                  </Button>

                  <Button
                    onClick={handlePauseToggle}
                    variant={isPaused ? "default" : "secondary"}
                    className={cn(
                      "flex-1 font-bold h-11 transition-all duration-300",
                      isPaused
                        ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                        : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                    )}
                    disabled={isPausing}
                  >
                    {isPaused ? (
                      <>
                        <Play className="mr-2 h-5 w-5 fill-current animate-pulse" />
                        REANUDAR
                      </>
                    ) : (
                      <>
                        <Pause className="mr-2 h-5 w-5" />
                        PAUSAR
                      </>
                    )}
                  </Button>
                </>
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
                {recentEntries.map((entry) => {
                  const task = (entry as any).task;
                  const project = task?.project;
                  const client = project?.client;
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
                          {Number(entry.amount).toFixed(2)} {project?.currency || ""}
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

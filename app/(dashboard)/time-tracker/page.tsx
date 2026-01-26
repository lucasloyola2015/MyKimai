"use client";

import { useEffect, useState } from "react";
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
import { Play, Pause, Square, Clock } from "lucide-react";
import type { Database } from "@/lib/types/database";
import { getRateContext, resolveRate } from "@/lib/utils/rates";
import { format, differenceInMinutes } from "date-fns";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];

interface TaskWithRelations extends Task {
  projects: Project & { clients: Client };
}

type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

export default function TimeTrackerPage() {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedTime, setPausedTime] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [recentEntries, setRecentEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadTasks();
    loadRecentEntries();

    // Update current time every second
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const loadTasks = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("tasks")
        .select("*, projects(*, clients(*))")
        .order("name");

      if (error) throw error;

      // Filter tasks that belong to user's projects
      const filteredTasks = (data || []).filter((task: any) => {
        const project = task.projects;
        return project && project.clients && project.clients.user_id === user.id;
      });

      setTasks(filteredTasks as TaskWithRelations[]);
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setLoading(false);
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
    if (!startTime) return pausedTime;
    if (isPaused) return pausedTime;
    const elapsed = differenceInMinutes(currentTime, startTime);
    return pausedTime + elapsed;
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  };

  const handleStart = () => {
    if (!selectedTaskId) {
      alert("Por favor selecciona una tarea");
      return;
    }

    setIsTracking(true);
    setIsPaused(false);
    setStartTime(new Date());
    setPausedTime(0);
  };

  const handlePause = () => {
    if (isPaused) {
      // Resume
      setIsPaused(false);
      setStartTime(new Date());
    } else {
      // Pause
      setIsPaused(true);
      if (startTime) {
        const elapsed = differenceInMinutes(new Date(), startTime);
        setPausedTime((prev) => prev + elapsed);
        setStartTime(null);
      }
    }
  };

  const handleStop = async () => {
    if (!selectedTaskId || !startTime) return;

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
      const rateContext = await getRateContext(selectedTaskId);
      const rate = resolveRate(rateContext);

      const endTime = new Date();
      const entryData = {
        user_id: user.id,
        task_id: selectedTaskId,
        description: description || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: totalMinutes,
        billable: true,
        rate_applied: rate,
        amount: rate ? (totalMinutes / 60) * rate : null,
      };

      const { error } = await supabase.from("time_entries").insert(entryData);

      if (error) throw error;

      // Reset
      setIsTracking(false);
      setIsPaused(false);
      setStartTime(null);
      setPausedTime(0);
      setDescription("");
      setSelectedTaskId("");

      loadRecentEntries();
      alert("Período de trabajo guardado exitosamente");
    } catch (error) {
      console.error("Error saving time entry:", error);
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
              <Label htmlFor="task">Tarea *</Label>
              <Select
                value={selectedTaskId}
                onValueChange={setSelectedTaskId}
                disabled={isTracking}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una tarea" />
                </SelectTrigger>
                <SelectContent>
                  {tasks.map((task) => {
                    const project = task.projects;
                    const client = project.clients;
                    return (
                      <SelectItem key={task.id} value={task.id}>
                        {task.name} - {project.name} ({client.name})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedTask && (
              <div className="rounded-lg border bg-muted p-3 text-sm">
                <p>
                  <strong>Cliente:</strong> {selectedTask.projects.clients.name}
                </p>
                <p>
                  <strong>Proyecto:</strong> {selectedTask.projects.name}
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="¿Qué estás haciendo?"
                disabled={isTracking && !isPaused}
              />
            </div>

            <div className="flex items-center justify-center space-x-4 rounded-lg border bg-muted p-6">
              <Clock className="h-8 w-8" />
              <div className="text-center">
                <div className="text-4xl font-bold">
                  {formatTime(elapsedMinutes)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {isTracking
                    ? isPaused
                      ? "Pausado"
                      : "En progreso"
                    : "Detenido"}
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
                <>
                  <Button
                    onClick={handlePause}
                    variant={isPaused ? "default" : "secondary"}
                    className="flex-1"
                  >
                    <Pause className="mr-2 h-4 w-4" />
                    {isPaused ? "Reanudar" : "Pausar"}
                  </Button>
                  <Button
                    onClick={handleStop}
                    variant="destructive"
                    className="flex-1"
                  >
                    <Square className="mr-2 h-4 w-4" />
                    Finalizar
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

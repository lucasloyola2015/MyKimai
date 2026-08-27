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
import { Play } from "lucide-react";
import { formatDateTime24 } from "@/lib/date-format";
import { useActiveTimeEntry } from "@/contexts/active-time-entry-context";
import { ActiveTasksPanel } from "@/components/dashboard/active-tasks-panel";
import { getClients } from "@/lib/actions/clients";
import { getProjects } from "@/lib/actions/projects";
import { startTimeEntryForProject, getRecentTimeEntries } from "@/lib/actions/time-entries";
import type { clients, projects, time_entries } from "@prisma/client";
import { toast } from "@/hooks/use-toast";

export default function TimeTrackerPage() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<clients[]>([]);
  const [projects, setProjects] = useState<(projects & { clients: clients })[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState("");
  const [recentEntries, setRecentEntries] = useState<time_entries[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [preloaded, setPreloaded] = useState(false);
  const { refreshActiveEntry } = useActiveTimeEntry();

  useEffect(() => {
    loadClients();
    loadRecentEntries();
    refreshActiveEntry();
  }, []);

  // Precarga desde query params (deep-link de "INICIAR" / proyectos).
  useEffect(() => {
    const clientId = searchParams.get("client_id");
    const projectId = searchParams.get("project_id");

    if (clientId && projectId && !preloaded && clients.length > 0) {
      (async () => {
        setSelectedClientId(clientId);
        setSelectedProjectId(projectId);
        await loadProjects(clientId);
        setPreloaded(true);
      })();
    }
  }, [searchParams, preloaded, clients.length]);

  useEffect(() => {
    if (selectedClientId) {
      loadProjects(selectedClientId);
    } else {
      setProjects([]);
      setSelectedProjectId("");
    }
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedProjectId) setTitle("");
  }, [selectedProjectId]);

  const loadClients = async () => {
    try {
      const data = await getClients();
      setClients(data);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast({ title: "Error", description: "No se pudieron cargar los clientes.", variant: "destructive" });
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
      toast({ title: "Error", description: "No se pudieron cargar los proyectos.", variant: "destructive" });
    }
  };

  const loadRecentEntries = async () => {
    try {
      const data = await getRecentTimeEntries(10);
      setRecentEntries(data);
    } catch (error) {
      console.error("Error loading recent entries:", error);
    }
  };

  const handleStart = async () => {
    if (!selectedProjectId) {
      toast({ title: "Error", description: "Elegí un proyecto", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Error", description: "Escribí un título para la sesión", variant: "destructive" });
      return;
    }

    setStarting(true);
    try {
      const result = await startTimeEntryForProject(selectedProjectId, title, description || undefined);
      if (!result.success) throw new Error(result.error);

      toast({ title: "Timer iniciado", description: "Podés iniciar más tareas en paralelo." });

      // Limpiar para iniciar otra tarea; refrescar el panel de activas.
      setTitle("");
      setDescription("");
      await refreshActiveEntry();
      await loadRecentEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al iniciar la tarea",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Time Tracker</h1>
        <p className="text-muted-foreground">
          Registrá tiempo en una o varias tareas en paralelo
        </p>
      </div>

      {/* Tareas corriendo en paralelo (controles play/pause/stop + edición) */}
      <ActiveTasksPanel />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Iniciar una tarea</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="client">Cliente *</Label>
              <Select
                value={selectedClientId}
                onValueChange={(value) => {
                  setSelectedClientId(value);
                  setSelectedProjectId("");
                  setTitle("");
                }}
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
                    setTitle("");
                  }}
                  disabled={!selectedClientId}
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
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="En qué estás trabajando (ej. Puesta en marcha PLC)"
                  maxLength={255}
                />
              </div>
            )}


            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="¿Qué vas a hacer en esta sesión?"
              />
            </div>

            <Button onClick={handleStart} disabled={!selectedProjectId || !title.trim() || loading || starting} className="w-full font-bold h-11">
              <Play className="mr-2 h-5 w-5 fill-current" />
              INICIAR TAREA
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Períodos Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No hay períodos registrados</p>
            ) : (
              <div className="space-y-4">
                {recentEntries.map((entry) => {
                  const task = (entry as any).tasks;
                  const project = task?.projects;
                  const client = project?.clients;
                  return (
                    <div key={entry.id} className="rounded-lg border p-4 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{(entry as any).title || task?.name || "—"}</p>
                        <p className="text-muted-foreground">{entry.duration_neto} min</p>
                      </div>
                      {project && (
                        <p className="text-muted-foreground text-xs">
                          {project.name} - {client?.name}
                        </p>
                      )}
                      {entry.description && (
                        <p className="mt-2 text-muted-foreground">{entry.description}</p>
                      )}
                      {entry.amount && (
                        <p className="mt-2 font-medium">
                          {Number(entry.amount).toFixed(2)} {project?.currency || ""}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatDateTime24(new Date(entry.start_time))}
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

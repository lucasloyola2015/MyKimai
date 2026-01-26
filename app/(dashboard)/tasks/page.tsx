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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Database } from "@/lib/types/database";
import Link from "next/link";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];

export default function TasksPage() {
  const [tasks, setTasks] = useState<(Task & { projects: Project })[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const supabase = createClientComponentClient();

  const [formData, setFormData] = useState({
    project_id: "",
    name: "",
    description: "",
    rate: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Load projects
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("*, clients(*)")
        .eq("clients.user_id", user.id)
        .order("name");

      if (projectsError) throw projectsError;
      setProjects((projectsData as any) || []);

      // Load tasks with projects
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select("*, projects(*)")
        .order("created_at", { ascending: false });

      if (tasksError) throw tasksError;

      // Filter tasks that belong to user's projects
      const userProjectIds = (projectsData || []).map((p: any) => p.id);
      const filteredTasks = (tasksData || []).filter((t: any) =>
        userProjectIds.includes(t.project_id)
      );

      setTasks(filteredTasks as any);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const taskData = {
        project_id: formData.project_id,
        name: formData.name,
        description: formData.description || null,
        rate: formData.rate ? parseFloat(formData.rate) : null,
      };

      if (editingTask) {
        const { error } = await supabase
          .from("tasks")
          .update(taskData)
          .eq("id", editingTask.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert(taskData);
        if (error) throw error;
      }

      setIsDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Error saving task:", error);
      alert("Error al guardar la tarea");
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      project_id: task.project_id,
      name: task.name,
      description: task.description || "",
      rate: task.rate?.toString() || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta tarea?")) return;

    try {
      const { error } = await supabase.from("tasks").delete().eq("id", id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error("Error deleting task:", error);
      alert("Error al eliminar la tarea");
    }
  };

  const resetForm = () => {
    setFormData({
      project_id: "",
      name: "",
      description: "",
      rate: "",
    });
    setEditingTask(null);
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tareas</h1>
          <p className="text-muted-foreground">
            Gestiona las tareas de tus proyectos
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} disabled={projects.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Tarea
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTask ? "Editar Tarea" : "Nueva Tarea"}
              </DialogTitle>
              <DialogDescription>
                Completa la información de la tarea
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="project_id">Proyecto *</Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, project_id: value })
                    }
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un proyecto" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project: any) => {
                        const client = project.clients;
                        return (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name} ({client.name})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rate">Tarifa</Label>
                  <Input
                    id="rate"
                    type="number"
                    step="0.01"
                    value={formData.rate}
                    onChange={(e) =>
                      setFormData({ ...formData, rate: e.target.value })
                    }
                    placeholder="0.00 (opcional, usa tarifa del proyecto/cliente si está vacío)"
                  />
                </div>
              </div>
              <DialogFooter>
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
                <Button type="submit">
                  {editingTask ? "Actualizar" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-muted-foreground mb-4">
            Necesitas crear al menos un proyecto antes de crear tareas.
          </p>
          <Link href="/dashboard/projects">
            <Button>Ir a Proyectos</Button>
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => {
          const project = task.projects as Project;
          return (
            <Card key={task.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{task.name}</span>
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(task)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(task.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    <strong>Proyecto:</strong> {project.name}
                  </p>
                  {task.description && (
                    <p className="text-muted-foreground line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  {task.rate && (
                    <p className="text-muted-foreground">
                      <strong>Tarifa:</strong> {task.rate}/h
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {tasks.length === 0 && projects.length > 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No hay tareas registradas. Crea tu primera tarea.
          </p>
        </div>
      )}
    </div>
  );
}

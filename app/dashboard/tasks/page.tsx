"use client";

import { useEffect, useState } from "react";
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
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { getClients } from "@/lib/actions/clients";
import { getProjects } from "@/lib/actions/projects";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
} from "@/lib/actions/tasks";
import type { tasks, projects, clients } from "@prisma/client";
import { toast } from "@/hooks/use-toast";

export default function TasksPage() {
  const [tasks, setTasks] = useState<(tasks & { projects: projects & { clients: clients } })[]>([]);
  const [clients, setClients] = useState<clients[]>([]);
  const [projects, setProjects] = useState<(projects & { clients: clients })[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<(projects & { clients: clients })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<tasks | null>(null);

  const [formData, setFormData] = useState({
    client_id: "",
    project_id: "",
    name: "",
    description: "",
    rate: "",
    is_billable: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load clients
      const clientsData = await getClients();
      setClients(clientsData);

      // Load projects
      const projectsData = await getProjects();
      setProjects(projectsData);

      // Load tasks
      const tasksData = await getTasks();
      setTasks(tasksData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos.",
        variant: "destructive",
      });
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
        is_billable: formData.is_billable,
      };

      let result;
      if (editingTask) {
        result = await updateTask(editingTask.id, {
          name: taskData.name,
          description: taskData.description,
          rate: taskData.rate,
          is_billable: taskData.is_billable,
        });
      } else {
        result = await createTask(taskData);
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: "Éxito",
        description: editingTask ? "Tarea actualizada correctamente." : "Tarea creada correctamente.",
      });

      setIsDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Error saving task:", error);
      toast({
        title: "Error",
        description: "Error al guardar la tarea",
        variant: "destructive",
      });
    }
  };

  const handleEdit = async (task: tasks) => {
    // Get the project to find the client
    const project = projects.find((p) => p.id === task.project_id);
    const clientId = project?.clients?.id || "";

    setEditingTask(task);
    setFormData({
      client_id: clientId,
      project_id: task.project_id,
      name: task.name,
      description: task.description || "",
      rate: task.rate?.toString() || "",
      is_billable: (task as any).is_billable ?? true,
    });

    // Filter projects for the selected client
    if (clientId) {
      const filtered = projects.filter((p) => p.clients?.id === clientId);
      setFilteredProjects(filtered);
    }

    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta tarea?")) return;

    try {
      const result = await deleteTask(id);
      if (!result.success) {
        throw new Error(result.error);
      }
      toast({
        title: "Éxito",
        description: "Tarea eliminada correctamente.",
      });
      loadData();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast({
        title: "Error",
        description: "Error al eliminar la tarea",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      client_id: "",
      project_id: "",
      name: "",
      description: "",
      rate: "",
      is_billable: true,
    });
    setEditingTask(null);
    setFilteredProjects([]);
  };

  const handleClientChange = (clientId: string) => {
    setFormData({ ...formData, client_id: clientId, project_id: "" });
    // Filter projects for the selected client
    const filtered = projects.filter((p) => p.clients?.id === clientId);
    setFilteredProjects(filtered);
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
                  <Label htmlFor="client_id">Cliente *</Label>
                  <Select
                    value={formData.client_id}
                    onValueChange={handleClientChange}
                    required
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
                {formData.client_id && (
                  <div className="grid gap-2">
                    <Label htmlFor="project_id">Proyecto *</Label>
                    <Select
                      value={formData.project_id}
                      onValueChange={(value) =>
                        setFormData({ ...formData, project_id: value })
                      }
                      required
                      disabled={!formData.client_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un proyecto" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                </div>

                <div className="flex items-center space-x-2 bg-muted/30 p-4 rounded-lg border">
                  {(() => {
                    const project = projects.find(p => p.id === formData.project_id);
                    const client = clients.find(c => c.id === formData.client_id);
                    const isInheritedNonBillable = (client && !(client as any).is_billable) || (project && !(project as any).is_billable);
                    const effectiveBillable = isInheritedNonBillable ? false : formData.is_billable;

                    return (
                      <>
                        <Checkbox
                          id="is_billable"
                          checked={effectiveBillable}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, is_billable: checked === true })
                          }
                          disabled={isInheritedNonBillable}
                        />
                        <div className="grid gap-1.5 leading-none">
                          <Label
                            htmlFor="is_billable"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Tarea Facturable
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {isInheritedNonBillable
                              ? "Heredado: El cliente o proyecto no es facturable."
                              : "Si se desactiva, las entradas de tiempo para esta tarea no se cobrarán."}
                          </p>
                        </div>
                      </>
                    );
                  })()}
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
          const project = task.projects;
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
                      <strong>Tarifa:</strong> {Number(task.rate)}/h
                    </p>
                  )}
                  <div className="pt-1">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${(task as any).is_billable && (task.projects as any).is_billable && (task.projects.clients as any).is_billable
                      ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      : "bg-orange-500/10 text-orange-500 border-orange-500/20"
                      }`}>
                      <ShieldCheck className="h-3 w-3" />
                      {(task as any).is_billable && (task.projects as any).is_billable && (task.projects.clients as any).is_billable ? "Facturable" : "No Facturable"}
                    </div>
                  </div>
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

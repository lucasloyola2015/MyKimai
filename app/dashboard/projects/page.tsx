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
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import type { Database } from "@/lib/types/database";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];

const CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "MXN", label: "MXN" },
  { value: "ARS", label: "ARS" },
  { value: "CLP", label: "CLP" },
  { value: "COP", label: "COP" },
];

const BILLING_TYPES = [
  { value: "hourly", label: "Por Hora" },
  { value: "fixed", label: "Precio Fijo" },
];

const PROJECT_STATUSES = [
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<(Project & { clients: Client & { is_billable: boolean } })[]>(
    []
  );
  const [clients, setClients] = useState<(Client & { is_billable: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const supabase = createClientComponentClient();

  const [formData, setFormData] = useState({
    client_id: "",
    name: "",
    description: "",
    currency: "USD",
    rate: "",
    billing_type: "hourly" as "fixed" | "hourly",
    status: "active" as "active" | "paused" | "completed" | "cancelled",
    start_date: "",
    end_date: "",
    is_billable: true,
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

      // Load clients
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("name");

      if (clientsError) throw clientsError;
      setClients(clientsData || []);

      // Load projects with clients
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("*, clients(*)")
        .eq("clients.user_id", user.id)
        .order("created_at", { ascending: false });

      if (projectsError) throw projectsError;
      setProjects((projectsData as any) || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const projectData = {
        client_id: formData.client_id,
        name: formData.name,
        description: formData.description || null,
        currency: formData.currency,
        rate: formData.rate ? parseFloat(formData.rate) : null,
        billing_type: formData.billing_type,
        status: formData.status,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        is_billable: formData.is_billable,
      };

      if (editingProject) {
        const { error } = await supabase
          .from("projects")
          .update(projectData)
          .eq("id", editingProject.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("projects")
          .insert(projectData);
        if (error) throw error;
      }

      setIsDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Error saving project:", error);
      alert("Error al guardar el proyecto");
    }
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      client_id: project.client_id,
      name: project.name,
      description: project.description || "",
      currency: project.currency,
      rate: project.rate?.toString() || "",
      billing_type: project.billing_type,
      status: project.status,
      start_date: project.start_date || "",
      end_date: project.end_date || "",
      is_billable: (project as any).is_billable ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este proyecto?")) return;

    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("Error al eliminar el proyecto");
    }
  };

  const resetForm = () => {
    setFormData({
      client_id: "",
      name: "",
      description: "",
      currency: "USD",
      rate: "",
      billing_type: "hourly",
      status: "active",
      start_date: "",
      end_date: "",
      is_billable: true,
    });
    setEditingProject(null);
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Proyectos</h1>
          <p className="text-muted-foreground">
            Gestiona tus proyectos y sus configuraciones
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} disabled={clients.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Proyecto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProject ? "Editar Proyecto" : "Nuevo Proyecto"}
              </DialogTitle>
              <DialogDescription>
                Completa la información del proyecto
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="client_id">Cliente *</Label>
                  <Select
                    value={formData.client_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, client_id: value })
                    }
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
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="currency">Moneda</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(value) =>
                        setFormData({ ...formData, currency: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((currency) => (
                          <SelectItem
                            key={currency.value}
                            value={currency.value}
                          >
                            {currency.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="billing_type">Tipo de Facturación</Label>
                    <Select
                      value={formData.billing_type}
                      onValueChange={(value: "fixed" | "hourly") =>
                        setFormData({ ...formData, billing_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BILLING_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="status">Estado</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(
                        value: "active" | "paused" | "completed" | "cancelled"
                      ) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="start_date">Fecha de Inicio</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) =>
                        setFormData({ ...formData, start_date: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="end_date">Fecha de Fin</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) =>
                        setFormData({ ...formData, end_date: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 bg-muted/30 p-4 rounded-lg border">
                  {(() => {
                    const client = clients.find(c => c.id === formData.client_id);
                    const isInheritedNonBillable = client ? !client.is_billable : false;
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
                            Proyecto Facturable
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {isInheritedNonBillable
                              ? "Heredado: El cliente no es facturable."
                              : "Si se desactiva, todas las tareas de este proyecto no serán facturables."}
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
                  {editingProject ? "Actualizar" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-muted-foreground mb-4">
            Necesitas crear al menos un cliente antes de crear proyectos.
          </p>
          <Link href="/dashboard/clients">
            <Button>Ir a Clientes</Button>
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => {
          const client = project.clients as Client;
          return (
            <Card key={project.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{project.name}</span>
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(project)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(project.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    <strong>Cliente:</strong> {client.name}
                  </p>
                  {project.description && (
                    <p className="text-muted-foreground line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      <strong>Estado:</strong>{" "}
                      {
                        PROJECT_STATUSES.find((s) => s.value === project.status)
                          ?.label
                      }
                    </span>
                    <span className="text-muted-foreground">
                      <strong>Tipo:</strong>{" "}
                      {
                        BILLING_TYPES.find(
                          (t) => t.value === project.billing_type
                        )?.label
                      }
                    </span>
                  </div>
                  {project.rate && (
                    <p className="text-muted-foreground">
                      <strong>Tarifa:</strong> {project.rate} {project.currency}
                      /h
                    </p>
                  )}
                  <div className="pt-2">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${(project as any).is_billable && (client as any).is_billable
                      ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      : "bg-orange-500/10 text-orange-500 border-orange-500/20"
                      }`}>
                      <ShieldCheck className="h-3 w-3" />
                      {(project as any).is_billable && (client as any).is_billable ? "Facturable" : "No Facturable"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {projects.length === 0 && clients.length > 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No hay proyectos registrados. Crea tu primer proyecto.
          </p>
        </div>
      )}
    </div>
  );
}

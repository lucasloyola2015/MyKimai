"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { Plus, Pencil, Trash2, ShieldCheck, Users, Flag, Search, X, FolderSearch } from "lucide-react";
import type { projects, clients as Client } from "@prisma/client";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { getClients } from "@/lib/actions/clients";
import {
  getProjects,
  getProjectsLastActivity,
  createProject,
  updateProject,
  countBilledEntriesForProject,
  deleteProject,
} from "@/lib/actions/projects";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/date-format";
import {
  DEFAULT_PROJECT_FILTERS,
  countProjectsByStatus,
  filterAndSortProjects,
  groupProjectsByClient,
  hasActiveProjectFilters,
  parseProjectFilters,
  projectFiltersToSearchParams,
  type LastActivityMap,
  type ProjectBillableFilter,
  type ProjectFilters,
  type ProjectSort,
  type ProjectStatusFilter,
} from "@/lib/utils/project-filters";

// La extensión de Prisma convierte rate (Decimal) a number en runtime.
type Project = Omit<projects, "rate"> & { rate: number | null };

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

// Pestañas del filtro de estado (en plural, "Todos" al final).
const STATUS_TABS: { value: ProjectStatusFilter; label: string }[] = [
  { value: "active", label: "Activos" },
  { value: "paused", label: "Pausados" },
  { value: "completed", label: "Completados" },
  { value: "cancelled", label: "Cancelados" },
  { value: "all", label: "Todos" },
];

const SORT_OPTIONS: { value: ProjectSort; label: string }[] = [
  { value: "activity", label: "Última actividad" },
  { value: "recent", label: "Más recientes" },
  { value: "name", label: "Nombre (A-Z)" },
  { value: "client", label: "Agrupar por cliente" },
];

const BILLABLE_OPTIONS: { value: ProjectBillableFilter; label: string }[] = [
  { value: "all", label: "Facturables y no" },
  { value: "billable", label: "Solo facturables" },
  { value: "non_billable", label: "Solo no facturables" },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<(Project & { clients: Client & { is_billable: boolean } })[]>(
    []
  );
  const [clients, setClients] = useState<(Client & { is_billable: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [lastActivity, setLastActivity] = useState<LastActivityMap>({});
  // Los filtros viven en la URL para conservarse al volver de un proyecto.
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ProjectFilters>(() => parseProjectFilters(searchParams));

  useEffect(() => {
    const qs = projectFiltersToSearchParams(filters).toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filters]);

  const updateFilters = (patch: Partial<ProjectFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

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
      const [clientsData, projectsData, lastActivityData] = await Promise.all([
        getClients(),
        getProjects(),
        // Solo sirve para ordenar: si falla, la página igual carga.
        getProjectsLastActivity().catch(() => ({})),
      ]);
      setClients(clientsData as any);
      setProjects(projectsData as any);
      setLastActivity(lastActivityData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const base = {
      name: formData.name,
      description: formData.description || null,
      currency: formData.currency,
      rate: formData.rate ? parseFloat(formData.rate) : null,
      billing_type: formData.billing_type,
      status: formData.status,
      start_date: formData.start_date ? new Date(formData.start_date) : null,
      end_date: formData.end_date ? new Date(formData.end_date) : null,
      is_billable: formData.is_billable,
    };

    // Si se está cambiando el cliente de un proyecto con horas ya facturadas,
    // avisar: los comprobantes emitidos no cambian, pero la atribución histórica
    // de horas por cliente en los reportes sí.
    if (editingProject && formData.client_id !== editingProject.client_id) {
      const billed = await countBilledEntriesForProject(editingProject.id);
      if (billed > 0) {
        const ok = confirm(
          `Este proyecto tiene ${billed} hora(s) ya facturadas.\n\n` +
          `Las facturas emitidas NO se modifican (conservan su cliente original), ` +
          `pero los reportes por cliente pasarán a atribuir esas horas al nuevo cliente.\n\n` +
          `¿Querés cambiar el cliente igualmente?`
        );
        if (!ok) return;
      }
    }

    const result = editingProject
      ? await updateProject(editingProject.id, { client_id: formData.client_id, ...base })
      : await createProject({ client_id: formData.client_id, ...base });

    if (!result.success) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: editingProject ? "Proyecto actualizado" : "Proyecto creado" });
    setIsDialogOpen(false);
    resetForm();
    loadData();
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
      start_date: project.start_date ? new Date(project.start_date).toISOString().split("T")[0] : "",
      end_date: project.end_date ? new Date(project.end_date).toISOString().split("T")[0] : "",
      is_billable: (project as any).is_billable ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este proyecto?")) return;

    const result = await deleteProject(id);
    if (!result.success) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Proyecto eliminado" });
    loadData();
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

  const visibleProjects = useMemo(
    () => filterAndSortProjects(projects, filters, lastActivity),
    [projects, filters, lastActivity]
  );
  const statusCounts = useMemo(() => countProjectsByStatus(projects, filters), [projects, filters]);
  // Visibilidad de las pestañas según el total (no los filtros) para que no
  // aparezcan y desaparezcan al cambiar de cliente.
  const totalByStatus = useMemo(
    () => countProjectsByStatus(projects, DEFAULT_PROJECT_FILTERS),
    [projects]
  );
  // En el filtro solo los clientes que tienen proyectos.
  const clientOptions = useMemo(
    () =>
      groupProjectsByClient(projects)
        .map(({ clientId, clientName }) => ({ id: clientId, name: clientName }))
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
    [projects]
  );
  const filtersActive = hasActiveProjectFilters(filters);
  const clearFilters = () => setFilters({ ...DEFAULT_PROJECT_FILTERS, sort: filters.sort });

  if (loading) {
    return <div>Cargando...</div>;
  }

  const renderProjectCard = (project: (typeof projects)[number]) => {
    const client = project.clients as Client;
    return (
      <Card key={project.id}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{project.name}</span>
            <div className="flex space-x-2">
              <Link href={`/dashboard/projects/${project.id}/milestones`}>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Hitos"
                >
                  <Flag className="h-4 w-4" />
                </Button>
              </Link>
              <Link href={`/dashboard/projects/${project.id}/stakeholders`}>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Stakeholders"
                >
                  <Users className="h-4 w-4" />
                </Button>
              </Link>
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
            <p className="text-muted-foreground">
              <strong>Última actividad:</strong>{" "}
              {lastActivity[project.id] ? formatDate(lastActivity[project.id]) : "sin horas cargadas"}
            </p>
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
  };

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

      {projects.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative md:flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.query}
                onChange={(e) => updateFilters({ query: e.target.value })}
                placeholder="Buscar por proyecto, cliente o descripción…"
                className="pl-8"
                aria-label="Buscar proyectos"
              />
            </div>
            <Select
              value={filters.clientId || "all"}
              onValueChange={(value) => updateFilters({ clientId: value === "all" ? "" : value })}
            >
              <SelectTrigger className="md:w-56" aria-label="Filtrar por cliente">
                <SelectValue placeholder="Todos los clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los clientes</SelectItem>
                {clientOptions.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.billable}
              onValueChange={(value: ProjectBillableFilter) => updateFilters({ billable: value })}
            >
              <SelectTrigger className="md:w-48" aria-label="Filtrar por facturación">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILLABLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.sort}
              onValueChange={(value: ProjectSort) => updateFilters({ sort: value })}
            >
              <SelectTrigger className="md:w-52" aria-label="Ordenar proyectos">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1"
              role="group"
              aria-label="Filtrar por estado"
            >
              {STATUS_TABS.filter(
                (tab) =>
                  tab.value === "active" ||
                  tab.value === "all" ||
                  tab.value === filters.status ||
                  totalByStatus[tab.value] > 0
              ).map((tab) => {
                const selected = filters.status === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => updateFilters({ status: tab.value })}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                      selected
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab.label}
                    <span className="ml-1.5 text-xs text-muted-foreground">{statusCounts[tab.value]}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {visibleProjects.length} de {projects.length} proyectos
              </span>
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-4 w-4" />
                  Limpiar filtros
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {filters.sort === "client" ? (
        <div className="space-y-6">
          {groupProjectsByClient(visibleProjects).map((group) => (
            <section key={group.clientId} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.clientName}
                <span className="ml-2 font-normal normal-case">
                  · {group.projects.length} {group.projects.length === 1 ? "proyecto" : "proyectos"}
                </span>
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {group.projects.map(renderProjectCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map(renderProjectCard)}
        </div>
      )}

      {projects.length > 0 && visibleProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <div className="mb-4 rounded-full bg-muted p-3">
            <FolderSearch className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Ningún proyecto coincide con los filtros.
          </p>
          <div className="flex gap-2">
            {filters.status !== "all" && (
              <Button variant="outline" size="sm" onClick={() => updateFilters({ status: "all" })}>
                Ver todos los estados
              </Button>
            )}
            {filtersActive && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
      )}

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

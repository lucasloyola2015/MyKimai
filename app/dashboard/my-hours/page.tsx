"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
import { Pencil, Trash2, Plus, Coffee, X, ShieldCheck } from "lucide-react";
import { getClients } from "@/lib/actions/clients";
import { getProjects } from "@/lib/actions/projects";
import { getContainerTaskId } from "@/lib/actions/time-entries";
import {
  getTimeEntries,
  updateTimeEntry,
  deleteTimeEntry,
  addTimeEntryBreak,
  updateTimeEntryBreak,
  deleteTimeEntryBreak,
  recalculateTimeEntryRate,
  assignEntryPackage,
  getAssignablePackages,
} from "@/lib/actions/time-entries";
import { format, differenceInMinutes } from "date-fns";
import { formatTime24 } from "@/lib/date-format";
import { toast } from "@/hooks/use-toast";
import { cn, calculateNetDurationMinutes } from "@/lib/utils";
import type { clients, projects, time_entries } from "@prisma/client";
import { DayTimeline } from "@/components/dashboard/DayTimeline";
import { ClientMultiSelect } from "@/components/dashboard/ClientMultiSelect";
import { projectsOfClients } from "@/lib/utils/client-selection";
import { liveAmount, liveTotals } from "@/lib/utils/entry-live";
import { arDayBounds, dayTotals } from "@/lib/utils/day-view";
import { listDateBounds, quickRanges, rangeError, type DayRange } from "@/lib/utils/date-range";
import { arDayKey, startOfDayAr, endOfDayAr } from "@/lib/timezone";
import { DayView } from "./day-view";
import { NewEntryDialog } from "./new-entry-dialog";
import { EntryDescription } from "@/components/dashboard/EntryDescription";
import { dayKey, timelineStartHourByDay, DEFAULT_TIMELINE_START_HOUR } from "@/lib/utils/timeline";

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<clients[]>([]);
  const [projects, setProjects] = useState<(projects & { clients: clients })[]>([]);
  const [entries, setEntries] = useState<time_entries[]>([]);
  // Línea de tiempo: arranca 07:00 salvo que el día tenga horas antes (misma escala por día).
  const timelineFromHour = useMemo(
    () => timelineStartHourByDay(entries.map((e) => new Date(e.start_time))),
    [entries]
  );
  // Clientes elegidos en el filtro: vacío = todos.
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  // Vista: LIST (listado) o Day (un día, líneas de tiempo sincronizadas).
  const [view, setView] = useState<"list" | "day">("list");
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const [dayKeyAr, setDayKeyAr] = useState<string>(() => arDayKey(new Date()));
  const [dayEntries, setDayEntries] = useState<any[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  // §paginación — por defecto mostrar últimos 90 días (no traer años de historial).
  const [showAll, setShowAll] = useState(false);
  // Rango Desde/Hasta del listado (días AR, "hasta" incluido). Vacío = ventana de 90 días.
  const [range, setRange] = useState<DayRange>({ from: "", to: "" });
  const rangeProblem = rangeError(range);
  const hasRange = Boolean(range.from || range.to);
  // Deep-link de edición: /dashboard/my-hours?edit=<id> abre el modal de esa
  // entrada (lo usa el lápiz del panel "Tareas activas" del dashboard).
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [handledEditId, setHandledEditId] = useState<string | null>(null);
  // Tick para recalcular en vivo Bruto/Pausas/Neto de las entradas activas
  // (sin esperar a frenar/pausar). ~20s = "update razonable", no cada segundo.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [formData, setFormData] = useState<any>({
    description: "",
    start_date: "",
    start_time: "",
    end_date: "",
    end_time: "",
    client_id: "",
    project_id: "",
    task_id: "",
    title: "",
  });
  const [modalProjects, setModalProjects] = useState<projects[]>([]);
  const [recalculatingIds, setRecalculatingIds] = useState<Set<string>>(new Set());
  /** Estado controlado por descanso: start/end en "HH:mm" para envío atómico (ambos siempre al servidor) */
  const [breakFormValues, setBreakFormValues] = useState<Record<string, { start: string; end: string }>>({});
  // §4.3 — paquetes de horas asignables al cliente de la entrada en edición.
  const [entryPackages, setEntryPackages] = useState<any[]>([]);
  const [assigningPackage, setAssigningPackage] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Si el proyecto elegido ya no es de un cliente seleccionado, se suelta.
  useEffect(() => {
    if (
      selectedProject &&
      !projectsOfClients(projects, selectedClients).some((p) => p.id === selectedProject)
    ) {
      setSelectedProject("");
    }
  }, [selectedClients, projects, selectedProject]);

  useEffect(() => {
    loadEntries();
  }, [selectedClients, selectedProject, showAll, range.from, range.to]);

  useEffect(() => {
    if (view === "day") loadDayEntries();
  }, [view, dayKeyAr, selectedClients, selectedProject]);

  useEffect(() => {
    if (isDialogOpen && formData.client_id) {
      loadModalProjects(formData.client_id);
    }
  }, [formData.client_id, isDialogOpen]);


  // Filtro del listado: rango Desde/Hasta si hay; si no, ventana de 90 días (o todo).
  const buildEntriesFilter = () => ({
    clientIds: selectedClients.length > 0 ? selectedClients : undefined,
    projectId: selectedProject || undefined,
    ...listDateBounds(range, showAll, Date.now()),
  });

  // Totales del listado (respetan clientes, proyecto y rango).
  const listTotals = useMemo(
    () =>
      dayTotals(
        (entries as any[]).map((e) => {
          const netoMin = liveTotals(e, nowTick).neto;
          return {
            netoMin,
            amount: liveAmount(e, netoMin),
            currency: e.tasks?.projects?.currency ?? "USD",
          };
        })
      ),
    [entries, nowTick]
  );

  const loadData = async () => {
    try {
      const [clientsData, projectsData, entriesData] = await Promise.all([
        getClients(),
        getProjects(),
        getTimeEntries(buildEntriesFilter()),
      ]);
      setClients(clientsData);
      setProjects(projectsData);
      setEntries(entriesData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadEntries = async () => {
    try {
      const entriesData = await getTimeEntries(buildEntriesFilter());
      setEntries(entriesData);
    } catch (error) {
      console.error("Error loading entries:", error);
    }
  };

  // Vista Day: las entradas que arrancan en el día elegido (hora AR), con el mismo filtro.
  const loadDayEntries = async () => {
    setDayLoading(true);
    try {
      const { start, end } = arDayBounds(dayKeyAr);
      const data = await getTimeEntries({
        clientIds: selectedClients.length > 0 ? selectedClients : undefined,
        projectId: selectedProject || undefined,
        startDate: new Date(start),
        endDate: new Date(end - 1),
      });
      setDayEntries(data);
    } catch (error) {
      console.error("Error loading day entries:", error);
    } finally {
      setDayLoading(false);
    }
  };

  /** Recarga lo que se ve tras editar/borrar (el listado y, si está abierta, la vista Day). */
  const reloadEntries = async () => {
    await Promise.all([loadEntries(), view === "day" ? loadDayEntries() : Promise.resolve()]);
  };

  /** Versión actualizada de una entrada (la busca en su día, esté o no en la ventana del listado). */
  const fetchFreshEntry = async (entry: any) => {
    const start = new Date(entry.start_time);
    const data = await getTimeEntries({ startDate: startOfDayAr(start), endDate: endOfDayAr(start) });
    return data.find((e: any) => e.id === entry.id);
  };

  const loadModalProjects = async (clientId: string) => {
    try {
      const data = await getProjects(clientId);
      setModalProjects(data);
    } catch (error) {
      console.error("Error loading modal projects:", error);
    }
  };

  // Proyectos de los clientes elegidos; con varios clientes se antepone el
  // nombre del cliente para distinguir proyectos homónimos.
  const filteredProjects = projectsOfClients(projects, selectedClients);
  const showClientInProject = selectedClients.length > 1;

  const handleEdit = (entry: any) => {
    setEditingEntry(entry);
    const startDate = new Date(entry.start_time);
    const endDate = entry.end_time ? new Date(entry.end_time) : new Date();

    const task = entry.tasks;
    const project = task?.projects;
    const client = project?.clients;

    setFormData({
      description: entry.description || "",
      start_date: format(startDate, "yyyy-MM-dd"),
      start_time: formatTime24(startDate),
      end_date: format(endDate, "yyyy-MM-dd"),
      end_time: entry.end_time ? formatTime24(endDate) : "",
      client_id: client?.id || "",
      project_id: project?.id || "",
      task_id: task?.id || "",
      title: entry.title || task?.name || "",
    });
    const breakValues: Record<string, { start: string; end: string }> = {};
    (entry.time_entry_breaks || []).forEach((b: any) => {
      breakValues[b.id] = {
        start: formatTime24(new Date(b.start_time)),
        end: b.end_time ? formatTime24(new Date(b.end_time)) : "",
      };
    });
    setBreakFormValues(breakValues);
    // §4.3 — cargar los paquetes del cliente para el override de consumo.
    setEntryPackages([]);
    if (client?.id) {
      getAssignablePackages(client.id)
        .then((pkgs) => setEntryPackages(pkgs || []))
        .catch(() => setEntryPackages([]));
    }
    setIsDialogOpen(true);
  };

  // Deep-link: abrir el modal de edición si llegamos con ?edit=<id> y la entrada
  // ya está cargada (la usa el lápiz del panel "Tareas activas" del dashboard).
  useEffect(() => {
    if (editId && editId !== handledEditId && entries.length > 0) {
      const entry = (entries as any[]).find((e) => e.id === editId);
      if (entry) {
        handleEdit(entry);
        setHandledEditId(editId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, entries, handledEditId]);

  // §4.3 — asignar/quitar a mano el paquete del que consume la entrada.
  const handleAssignPackage = async (packageId: string | null) => {
    if (!editingEntry) return;
    setAssigningPackage(true);
    try {
      const result = await assignEntryPackage(editingEntry.id, packageId);
      if (!result.success) throw new Error(result.error);
      toast({
        title: packageId ? "Paquete asignado" : "Paquete quitado",
        description: packageId
          ? "Estas horas se descuentan del paquete y no se facturan por hora."
          : "Estas horas vuelven a facturarse por hora.",
      });
      setEditingEntry((prev: any) =>
        prev ? { ...prev, consumed_from_package_id: packageId } : prev
      );
      await reloadEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo asignar el paquete",
        variant: "destructive",
      });
    } finally {
      setAssigningPackage(false);
    }
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
      reloadEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al eliminar la entrada",
        variant: "destructive",
      });
    }
  };

  const handleRecalculateRate = async (id: string) => {
    setRecalculatingIds(prev => new Set(prev).add(id));
    try {
      const result = await recalculateTimeEntryRate(id);
      if (!result.success) throw new Error(result.error);

      toast({
        title: "Tarifa Recalculada",
        description: "El precio de la jornada se ha actualizado con la configuración vigente.",
      });
      await reloadEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo recalcular la tarifa",
        variant: "destructive",
      });
    } finally {
      setRecalculatingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
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

      // Las tareas ya no se eligen: la entrada se ancla a la tarea contenedora
      // del proyecto seleccionado y el detalle real va en el título.
      const containerTaskId = formData.project_id
        ? await getContainerTaskId(formData.project_id)
        : null;

      const result = await updateTimeEntry(editingEntry.id, {
        description: formData.description || null,
        start_time: startDateTime,
        end_time: endDateTime,
        title: formData.title.trim() || null,
        task_id: containerTaskId || formData.task_id,
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
      reloadEntries();
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
    const start = new Date(now.getTime() - 5 * 60000);
    const result = await addTimeEntryBreak(editingEntry.id, start, now);
    if (result.success) {
      await reloadEntries();
      const updated = await fetchFreshEntry(editingEntry);
      if (updated) {
        setEditingEntry(updated);
        setBreakFormValues((prev) => {
          const next = { ...prev };
          (updated.time_entry_breaks || []).forEach((br: any) => {
            if (!(br.id in next))
              next[br.id] = {
                start: formatTime24(new Date(br.start_time)),
                end: br.end_time ? formatTime24(new Date(br.end_time)) : "",
              };
          });
          return next;
        });
      }
    }
  };

  const handleUpdateBreak = async (breakId: string, startTimeStr: string, endTimeStr: string) => {
    if (!editingEntry) return;
    const dateStr = formData.start_date;
    const start = new Date(`${dateStr}T${startTimeStr}`);
    const end = endTimeStr ? new Date(`${dateStr}T${endTimeStr}`) : null;

    const result = await updateTimeEntryBreak(breakId, start, end);
    if (result.success) {
      await reloadEntries();
      const updated = await fetchFreshEntry(editingEntry);
      if (updated) setEditingEntry(updated);
    }
  };

  const handleDeleteBreak = async (breakId: string) => {
    if (!confirm("¿Eliminar esta pausa?")) return;
    const result = await deleteTimeEntryBreak(breakId);
    if (result.success) {
      reloadEntries();
      const updated = await fetchFreshEntry(editingEntry);
      if (updated) setEditingEntry(updated);
    }
  };
  const resetForm = () => {
    setFormData({
      description: "",
      start_date: "",
      start_time: "",
      end_date: "",
      end_time: "",
      client_id: "",
      project_id: "",
      task_id: "",
      title: "",
    });
    setModalProjects([]);
    setBreakFormValues({});
    setEditingEntry(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mis Horas</h1>
          <p className="text-muted-foreground">
            Gestiona todas tus entradas de tiempo trabajadas
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Button
          size="icon"
          className="h-9 w-9"
          onClick={() => setNewEntryOpen(true)}
          aria-label="Nueva tarea"
          title="Nueva tarea"
        >
          <Plus className="h-5 w-5" />
        </Button>
        <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Vista">
          {([
            ["list", "LIST"],
            ["day", "Day"],
          ] as const).map(([value, text]) => (
            <Button
              key={value}
              role="tab"
              aria-selected={view === value}
              variant={view === value ? "default" : "ghost"}
              size="sm"
              className="h-8 px-4"
              onClick={() => setView(value)}
            >
              {text}
            </Button>
          ))}
        </div>
        </div>
      </div>

      <NewEntryDialog
        open={newEntryOpen}
        onOpenChange={setNewEntryOpen}
        clients={clients}
        projects={projects}
        defaultDayKey={view === "day" ? dayKeyAr : arDayKey(nowTick)}
        defaultClientId={selectedClients.length === 1 ? selectedClients[0] : undefined}
        onCreated={async (day) => {
          // En Day, saltar al día de la tarea nueva (el cambio de día recarga solo).
          if (view === "day" && day !== dayKeyAr) {
            setDayKeyAr(day);
            await loadEntries();
          } else {
            await reloadEntries();
          }
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="client_filter">Clientes</Label>
              <ClientMultiSelect
                id="client_filter"
                clients={clients}
                value={selectedClients}
                onChange={setSelectedClients}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project_filter">Proyecto</Label>
              <Select
                value={selectedProject || "all"}
                onValueChange={(value) => {
                  setSelectedProject(value === "all" ? "" : value);
                }}
                disabled={selectedClients.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los proyectos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proyectos</SelectItem>
                  {filteredProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {showClientInProject ? `${project.clients?.name} · ${project.name}` : project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Rango de fechas (solo LIST). Sin rango: ventana de 90 días con toggle. */}
          {view === "list" && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="range_from">Desde</Label>
                  <Input
                    id="range_from"
                    type="date"
                    value={range.from}
                    max={range.to || undefined}
                    onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="range_to">Hasta</Label>
                  <Input
                    id="range_to"
                    type="date"
                    value={range.to}
                    min={range.from || undefined}
                    onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {quickRanges(arDayKey(nowTick)).map((q) => (
                  <Button
                    key={q.key}
                    variant={range.from === q.from && range.to === q.to ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setRange({ from: q.from, to: q.to })}
                  >
                    {q.label}
                  </Button>
                ))}
                {hasRange && (
                  <Button variant="ghost" size="sm" onClick={() => setRange({ from: "", to: "" })}>
                    <X className="mr-1 h-4 w-4" />
                    Quitar rango
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={rangeProblem ? "text-destructive" : "text-muted-foreground"}>
                  {rangeProblem
                    ? `${rangeProblem}: se muestran los últimos 90 días`
                    : hasRange
                      ? `Mostrando ${range.from ? `desde el ${range.from.split("-").reverse().join("/")}` : "todo"}${range.to ? ` hasta el ${range.to.split("-").reverse().join("/")}` : " hasta hoy"}`
                      : showAll
                        ? "Mostrando todo el historial"
                        : "Mostrando los últimos 90 días"}
                </span>
                {!hasRange && (
                  <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Ver últimos 90 días" : "Ver todo el historial"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {view === "day" && (
        <DayView
          dayKey={dayKeyAr}
          onDayChange={setDayKeyAr}
          entries={dayEntries}
          loading={dayLoading}
          now={nowTick}
          onEdit={handleEdit}
          onChanged={reloadEntries}
        />
      )}

      {view === "list" && (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              Entradas de Tiempo ({entries.length} resultados)
            </CardTitle>
            {entries.length > 0 && (
              <div className="flex items-center gap-4 rounded-lg border bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950">
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 leading-none mb-0.5">Neto</p>
                  <p className="font-mono text-sm font-black text-blue-700 dark:text-blue-400 leading-none">
                    {(listTotals.netoMin / 60).toFixed(2)}h
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-0.5">Inversión</p>
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100 leading-none">
                    {listTotals.byCurrency.map((c, i) => (
                      <span key={c.currency}>
                        {i > 0 && <span className="mx-1 font-normal opacity-40">+</span>}
                        {c.amount.toFixed(2)} <span className="text-[9px] font-medium opacity-40">{c.currency}</span>
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => {
                const task = (entry as any).tasks;
                const project = task?.projects;
                const client = project?.clients;
                const activeBreak = (entry as any).time_entry_breaks?.find((b: any) => b.end_time === null);
                const totals = liveTotals(entry, nowTick);
                const inversion = liveAmount(entry, totals.neto);

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "group relative rounded-xl border p-3 transition-all hover:border-primary/30 hover:shadow-sm",
                      !entry.end_time
                        ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* LADO IZQUIERDO: Task & Client */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate uppercase tracking-tight text-sm">
                            {format(new Date(entry.start_time), "dd/MM")} - {(entry as any).title || task?.name || "—"}
                          </h3>
                          {!entry.end_time && (
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="En curso" />
                          )}
                          {(entry as any).source === "api" && (
                            <span className="shrink-0 text-xs leading-none" title="Cargada por un agente de IA (API)" aria-label="Cargada por un agente de IA">
                              🤖
                            </span>
                          )}
                          {!entry.billable && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-500/10 text-[8px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-tighter">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              No Facturable
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest truncate">
                          {client?.name} <span className="mx-1 text-slate-300 dark:text-slate-700 font-normal">|</span> {project?.name}
                        </p>
                      </div>

                      {/* CENTRO: Desglose Compacto (Cálculo) */}
                      <div className="hidden sm:flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-lg px-2 py-1 gap-3">
                        <div className="text-center">
                          <p className="text-[6px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-0.5">Bruto</p>
                          <p className="text-[10px] font-mono font-medium text-slate-500 leading-none">
                            {(totals.bruto / 60).toFixed(2)}h
                          </p>
                        </div>
                        <div className="text-slate-300 text-[10px] font-light">-</div>
                        <div className="text-center">
                          <p className="text-[6px] font-black text-orange-400 uppercase tracking-tighter leading-none mb-0.5">Pausas</p>
                          <p className="text-[10px] font-mono font-bold text-orange-600 dark:text-orange-400 leading-none">
                            {(totals.pausas / 60).toFixed(2)}h
                          </p>
                        </div>
                        <div className="text-slate-300 text-[10px] font-light">=</div>
                        <div className="text-center min-w-[35px]">
                          <p className="text-[6px] font-black text-blue-400 uppercase tracking-tighter leading-none mb-0.5">Neto</p>
                          <p className="text-[11px] font-mono font-black text-blue-700 dark:text-blue-400 leading-none">
                            {(totals.neto / 60).toFixed(2)}h
                          </p>
                        </div>
                      </div>

                      {/* LADO DERECHO: Inversión y Acciones */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="mr-2 text-right hidden md:block">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Inversión</p>
                          <p className="text-sm font-black text-slate-800 dark:text-slate-100 leading-none">
                            {recalculatingIds.has(entry.id) ? (
                              <span className="animate-pulse text-blue-600">??.??</span>
                            ) : (
                              inversion.toFixed(2)
                            )} <span className="text-[9px] font-medium opacity-40">{project?.currency}</span>
                          </p>
                        </div>
                        <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(entry)}
                            className="h-8 w-8 rounded-none hover:bg-white dark:hover:bg-slate-900 text-slate-400 hover:text-primary transition-colors border-r dark:border-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRecalculateRate(entry.id)}
                            className="h-8 w-8 rounded-none hover:bg-white dark:hover:bg-slate-900 text-slate-400 hover:text-blue-600 transition-colors border-r dark:border-slate-800"
                            disabled={entry.is_billed}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" className="bi bi-currency-exchange" viewBox="0 0 16 16">
                              <path d="M0 5a5 5 0 0 0 4.027 4.905 6.5 6.5 0 0 1 .544-2.073C3.695 7.536 3.132 6.864 3 5.91h-.5v-.426h.466V5.05q-.001-.07.004-.135H2.5v-.427h.511C3.236 3.24 4.213 2.5 5.681 2.5c.316 0 .59.031.819.085v.733a3.5 3.5 0 0 0-.815-.082c-.919 0-1.538.466-1.734 1.252h1.917v.427h-1.98q-.004.07-.003.147v.422h1.983v.427H3.93c.118.602.468 1.03 1.005 1.229a6.5 6.5 0 0 1 4.97-3.113A5.002 5.002 0 0 0 0 5m16 5.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0m-7.75 1.322c.069.835.746 1.485 1.964 1.562V14h.54v-.62c1.259-.086 1.996-.74 1.996-1.69 0-.865-.563-1.31-1.57-1.54l-.426-.1V8.374c.54.06.884.347.966.745h.948c-.07-.804-.779-1.433-1.914-1.502V7h-.54v.629c-1.076.103-1.808.732-1.808 1.622 0 .787.544 1.288 1.45 1.493l.358.085v1.78c-.554-.08-.92-.376-1.003-.787zm1.96-1.895c-.532-.12-.82-.364-.82-.732 0-.41.311-.719.824-.809v1.54h-.005zm.622 1.044c.645.145.943.38.943.796 0 .474-.37.8-1.02.86v-1.674z" />
                            </svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(entry.id)}
                            className="h-8 w-8 rounded-none hover:bg-white text-slate-400 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* DESCRIPCIÓN (editable en el lugar) */}
                    <EntryDescription
                      entryId={entry.id}
                      description={entry.description}
                      onSaved={(description) =>
                        setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, description } : e)))
                      }
                    />

                    {/* LÍNEA DE TIEMPO (Solo se muestra el componente) */}
                    <div className="mt-2">
                      <DayTimeline
                        startTime={new Date(entry.start_time)}
                        endTime={entry.end_time ? new Date(entry.end_time) : null}
                        breaks={(entry as any).time_entry_breaks}
                        fromHour={timelineFromHour.get(dayKey(new Date(entry.start_time))) ?? DEFAULT_TIMELINE_START_HOUR}
                      />
                    </div>
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
      )}

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
                <Label htmlFor="modal_client">Cliente</Label>
                <Select
                  value={formData.client_id}
                  onValueChange={(value) => setFormData({ ...formData, client_id: value, project_id: "", task_id: "" })}
                >
                  <SelectTrigger id="modal_client">
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="modal_project">Proyecto</Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) => setFormData({ ...formData, project_id: value, task_id: "" })}
                    disabled={!formData.client_id}
                  >
                    <SelectTrigger id="modal_project">
                      <SelectValue placeholder="Seleccionar proyecto" />
                    </SelectTrigger>
                    <SelectContent>
                      {modalProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="modal_title">Título</Label>
                  <Input
                    id="modal_title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="En qué trabajaste"
                    maxLength={255}
                  />
                </div>
              </div>

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
                  {editingEntry?.time_entry_breaks?.length > 0 ? (
                    editingEntry.time_entry_breaks.map((b: any) => {
                      const breakVal = breakFormValues[b.id] ?? {
                        start: formatTime24(new Date(b.start_time)),
                        end: b.end_time ? formatTime24(new Date(b.end_time)) : "",
                      };
                      return (
                        <div key={b.id} className="flex items-center gap-2 bg-muted/50 p-2 rounded-md">
                          <Input
                            type="time"
                            value={breakVal.start}
                            className="h-8 text-xs"
                            onChange={(e) =>
                              setBreakFormValues((prev) => ({
                                ...prev,
                                [b.id]: { ...(prev[b.id] ?? breakVal), start: e.target.value },
                              }))
                            }
                            onBlur={(e) =>
                              handleUpdateBreak(b.id, e.target.value, breakFormValues[b.id]?.end ?? breakVal.end)
                            }
                          />
                          <span className="text-muted-foreground text-xs">→</span>
                          <Input
                            type="time"
                            value={breakVal.end}
                            className="h-8 text-xs"
                            placeholder="En curso"
                            disabled={!b.end_time}
                            onChange={(e) =>
                              setBreakFormValues((prev) => ({
                                ...prev,
                                [b.id]: { ...(prev[b.id] ?? breakVal), end: e.target.value },
                              }))
                            }
                            onBlur={(e) =>
                              handleUpdateBreak(b.id, breakFormValues[b.id]?.start ?? breakVal.start, e.target.value)
                            }
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
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2 italic">
                      No hay pausas registradas en esta sesión.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* §4.3 — Paquete de horas: de qué paquete consume esta entrada. */}
            <div className="space-y-2 rounded-md border p-3">
              <Label htmlFor="entry-package">Paquete de horas</Label>
              <select
                id="entry-package"
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={editingEntry?.consumed_from_package_id || ""}
                disabled={assigningPackage || entryPackages.length === 0}
                onChange={(e) => handleAssignPackage(e.target.value || null)}
              >
                <option value="">Sin paquete (se factura por hora)</option>
                {entryPackages.map((p) => {
                  const remaining = Number(p.hours) - Number(p.hours_used);
                  const scope = p.projects?.name ? `${p.projects.name} · ` : "General · ";
                  return (
                    <option key={p.id} value={p.id}>
                      {scope}
                      {remaining.toFixed(1)}h libres de {Number(p.hours).toFixed(0)}h
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-muted-foreground">
                {entryPackages.length === 0
                  ? "Este cliente no tiene paquetes de horas."
                  : "Si consume de un paquete, estas horas no se facturan por hora (ya están prepagas). Al frenar el timer se asigna automáticamente; acá lo podés cambiar."}
              </p>
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

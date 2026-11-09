"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { arFormat } from "@/lib/timezone";
import { manualEntryTimes } from "@/lib/utils/manual-entry";
import { createManualTimeEntry, type CreateManualTimeEntryResult } from "@/lib/actions/time-entries";

type Conflict = Extract<CreateManualTimeEntryResult, { success: false }>["conflict"];

const hm = (t: string | null) => (t ? arFormat(t, "HH:mm") : "en curso");

/**
 * Nueva tarea cargada a mano (botón + de Mis Horas): cliente, proyecto, título,
 * día y horario. Si choca con horas de otro proyecto, muestra cuáles y deja
 * cargarla igual (trabajo en paralelo); con el mismo proyecto no se puede.
 */
export function NewEntryDialog({
  open,
  onOpenChange,
  clients,
  projects,
  defaultDayKey,
  defaultClientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; client_id: string; status?: string | null }[];
  defaultDayKey: string;
  defaultClientId?: string;
  /** Tras crearla: el día AR en que quedó, para mostrarlo. */
  onCreated: (dayKey: string) => void | Promise<void>;
}) {
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [day, setDay] = useState(defaultDayKey);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict>(undefined);

  // Cada vez que se abre arranca limpio, en el día que se está mirando.
  useEffect(() => {
    if (!open) return;
    setClientId(defaultClientId ?? "");
    setProjectId("");
    setTitle("");
    setDescription("");
    setDay(defaultDayKey);
    setStart("");
    setEnd("");
    setError(null);
    setConflict(undefined);
  }, [open, defaultDayKey, defaultClientId]);

  // Proyectos del cliente: los activos primero, sin los cancelados.
  const clientProjects = useMemo(() => {
    const rank = (s?: string | null) => (s === "completed" ? 2 : s === "paused" ? 1 : 0);
    return projects
      .filter((p) => p.client_id === clientId && p.status !== "cancelled")
      .sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
  }, [projects, clientId]);

  // Con un solo proyecto, se elige solo.
  useEffect(() => {
    if (clientProjects.length === 1) setProjectId(clientProjects[0].id);
  }, [clientProjects]);

  const times = start && end ? manualEntryTimes(day, start, end) : null;
  const canSubmit = !!projectId && title.trim().length > 0 && !!times?.ok && !saving;

  // Cambiar algo del horario o del proyecto invalida la advertencia anterior.
  useEffect(() => {
    setConflict(undefined);
    setError(null);
  }, [projectId, day, start, end]);

  const submit = async (allowOverlap = false) => {
    if (!times?.ok || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createManualTimeEntry({
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        start_time: times.start.toISOString(),
        end_time: times.end.toISOString(),
        allow_overlap: allowOverlap,
      });
      if (!res.success) {
        setError(res.error);
        setConflict(res.conflict);
        return;
      }
      toast({
        title: "Tarea agregada",
        description: `${title.trim()} · ${start}–${end}${times.nextDay ? " (+1 día)" : ""}`,
      });
      onOpenChange(false);
      await onCreated(day);
    } catch (e) {
      console.error("Error al crear la tarea:", e);
      setError("Error de conexión. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const duration =
    times?.ok && times.minutes > 0
      ? `${Math.floor(times.minutes / 60)}h${String(times.minutes % 60).padStart(2, "0")}${times.nextDay ? " · termina al día siguiente" : ""}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
          <DialogDescription>Cargá a mano horas ya trabajadas.</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="new_client">Cliente</Label>
              <Select
                value={clientId}
                onValueChange={(v) => {
                  setClientId(v);
                  setProjectId("");
                }}
              >
                <SelectTrigger id="new_client">
                  <SelectValue placeholder="Elegir cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new_project">Proyecto</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={!clientId}>
                <SelectTrigger id="new_project">
                  <SelectValue placeholder={clientId ? "Elegir proyecto" : "Primero el cliente"} />
                </SelectTrigger>
                <SelectContent>
                  {clientProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="new_title">Título</Label>
            <Input
              id="new_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Qué se hizo"
              maxLength={255}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="new_day">Fecha</Label>
              <Input id="new_day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new_start">Inicio</Label>
              <Input id="new_start" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new_end">Fin</Label>
              <Input id="new_end" type="time" step={60} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {duration && <p className="-mt-2 text-xs text-muted-foreground">Duración: {duration}</p>}

          <div className="grid gap-1.5">
            <Label htmlFor="new_description">Descripción (opcional)</Label>
            <Textarea
              id="new_description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300"
            >
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </p>
              {conflict && (
                <ul className="mt-2 space-y-0.5 font-mono text-xs">
                  {conflict.overlaps.map((o) => (
                    <li key={o.id}>
                      {hm(o.start_time)}–{hm(o.end_time)} · {o.project}
                      {o.title ? ` · ${o.title}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {conflict?.reason === "needs_confirmation" ? (
              <Button type="button" onClick={() => submit(true)} disabled={!canSubmit}>
                {saving ? "Guardando..." : "Cargar igual (en paralelo)"}
              </Button>
            ) : (
              <Button type="submit" disabled={!canSubmit}>
                {saving ? "Guardando..." : "Agregar"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

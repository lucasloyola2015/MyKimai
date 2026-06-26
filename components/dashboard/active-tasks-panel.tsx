"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Play, Pause, Square, Pencil, Plus, Trash2, Clock, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationMinutes } from "@/lib/utils/duration";
import { formatDateTime24 } from "@/lib/date-format";
import { toast } from "@/hooks/use-toast";
import {
  useActiveTimeEntry,
  type ActiveTimeEntry,
} from "@/contexts/active-time-entry-context";
import {
  addTimeEntryBreak,
  updateTimeEntryBreak,
  deleteTimeEntryBreak,
  updateTimeEntryDescription,
} from "@/lib/actions/time-entries";

// ---- helpers ---------------------------------------------------------------

function toLocalInput(value: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Minutos netos en vivo: (ahora − inicio) − pausas (la pausa abierta corre hasta ahora). */
function computeLiveNeto(entry: ActiveTimeEntry, now: number): number {
  const start = new Date(entry.start_time).getTime();
  let breaksMs = 0;
  for (const b of entry.breaks ?? []) {
    const bs = new Date(b.start_time).getTime();
    const be = b.end_time ? new Date(b.end_time).getTime() : now;
    breaksMs += Math.max(0, be - bs);
  }
  return Math.max(0, Math.floor((now - start - breaksMs) / 60000));
}

function isPausedEntry(entry: ActiveTimeEntry): boolean {
  return (entry.breaks ?? []).some((b) => b.end_time === null);
}

function taskLabel(entry: ActiveTimeEntry): { task: string; sub: string } {
  const t = entry.tasks;
  const project = t?.projects;
  const client = project?.clients;
  return {
    task: t?.name ?? "Tarea",
    sub: [client?.name, project?.name].filter(Boolean).join(" → "),
  };
}

// ---- break editor row ------------------------------------------------------

function BreakRow({
  brk,
  onChanged,
}: {
  brk: { id: string; start_time: string | Date; end_time: string | Date | null };
  onChanged: () => Promise<void>;
}) {
  const [start, setStart] = useState(toLocalInput(brk.start_time));
  const [end, setEnd] = useState(toLocalInput(brk.end_time));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const s = parseLocalInput(start);
    if (!s) {
      toast({ title: "Inicio inválido", variant: "destructive" });
      return;
    }
    const e = parseLocalInput(end); // null = pausa abierta
    if (e && e < s) {
      toast({ title: "El fin no puede ser anterior al inicio", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await updateTimeEntryBreak(brk.id, s, e);
      if (!res.success) throw new Error(res.error);
      toast({ title: "Pausa actualizada" });
      await onChanged();
    } catch (err) {
      toast({ title: "Error al actualizar la pausa", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await deleteTimeEntryBreak(brk.id);
      if (!res.success) throw new Error(res.error);
      toast({ title: "Pausa eliminada" });
      await onChanged();
    } catch (err) {
      toast({ title: "Error al eliminar la pausa", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
      <div className="grid gap-1">
        <Label className="text-xs">Inicio</Label>
        <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 text-xs" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fin {(!end && "(abierta)") || ""}</Label>
        <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 text-xs" />
      </div>
      <Button size="sm" variant="secondary" className="h-8" onClick={save} disabled={busy}>
        Guardar
      </Button>
      <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={remove} disabled={busy} aria-label="Eliminar pausa">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---- edit dialog -----------------------------------------------------------

function EditDialog({
  entry,
  open,
  onOpenChange,
  onChanged,
}: {
  entry: ActiveTimeEntry;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [desc, setDesc] = useState(entry.description ?? "");
  const [busy, setBusy] = useState(false);
  const { task, sub } = taskLabel(entry);

  // Re-seed la descripción cuando se abre o cambia la entrada.
  useEffect(() => {
    if (open) setDesc(entry.description ?? "");
  }, [open, entry.id]);

  const saveDesc = async () => {
    setBusy(true);
    try {
      const res = await updateTimeEntryDescription(entry.id, desc || null);
      if (!res.success) throw new Error(res.error);
      toast({ title: "Comentario guardado" });
      await onChanged();
    } catch (err) {
      toast({ title: "Error al guardar el comentario", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const addBreak = async () => {
    setBusy(true);
    try {
      const now = new Date();
      const res = await addTimeEntryBreak(entry.id, now, now);
      if (!res.success) throw new Error(res.error);
      toast({ title: "Pausa agregada", description: "Ajustá el inicio/fin abajo." });
      await onChanged();
    } catch (err) {
      toast({ title: "Error al agregar la pausa", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const breaks = entry.breaks ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar sesión</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {task}
            {sub && <span className="block">{sub}</span>}
          </p>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor={`desc-${entry.id}`}>Comentario de la sesión</Label>
          <Textarea
            id={`desc-${entry.id}`}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="¿Qué estás haciendo en esta sesión?"
            rows={3}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={saveDesc} disabled={busy}>
              Guardar comentario
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Descansos / pausas</Label>
            <Button size="sm" variant="outline" onClick={addBreak} disabled={busy}>
              <Plus className="mr-1 h-4 w-4" /> Agregar pausa
            </Button>
          </div>
          {breaks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin pausas registradas.</p>
          ) : (
            <div className="space-y-2">
              {breaks.map((b) => (
                <BreakRow key={b.id} brk={b} onChanged={onChanged} />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            El tiempo de pausa no cuenta en el neto facturable. Dejá el fin vacío para una pausa en curso.
          </p>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- single active task card ----------------------------------------------

function ActiveTaskCard({
  entry,
  now,
  onChanged,
}: {
  entry: ActiveTimeEntry;
  now: number;
  onChanged: () => Promise<void>;
}) {
  const { pauseActiveEntry, resumeActiveEntry, stopActiveEntry } = useActiveTimeEntry();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const paused = isPausedEntry(entry);
  const neto = computeLiveNeto(entry, now);
  const { task, sub } = taskLabel(entry);

  const togglePause = async () => {
    setBusy(true);
    try {
      if (paused) {
        await resumeActiveEntry(entry.id);
        toast({ title: "Reanudada" });
      } else {
        await pauseActiveEntry(entry.id);
        toast({ title: "En pausa", description: "El tiempo de pausa no se cuenta en el neto." });
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await stopActiveEntry(entry.id);
      toast({ title: "Sesión finalizada", description: "El tiempo neto fue guardado." });
    } catch (err) {
      toast({ title: "Error al finalizar", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
        paused ? "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20" : "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
              paused ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
            )}
          />
          <p className="truncate font-semibold">{task}</p>
        </div>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        {entry.description && (
          <p className="mt-1 truncate text-xs italic text-muted-foreground">“{entry.description}”</p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Desde {formatDateTime24(new Date(entry.start_time))}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className={cn("font-mono text-xl font-bold", paused && "text-amber-600")}>
            {formatDurationMinutes(neto)}
          </div>
          <div className={cn("text-[11px] font-medium", paused ? "text-amber-600" : "text-emerald-600")}>
            {paused ? "EN PAUSA" : "En progreso"}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant={paused ? "default" : "secondary"}
            className={cn("h-9 w-9", paused && "bg-amber-500 hover:bg-amber-600 text-white")}
            onClick={togglePause}
            disabled={busy}
            aria-label={paused ? "Reanudar" : "Pausar"}
            title={paused ? "Reanudar" : "Pausar"}
          >
            {paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="destructive"
            className="h-9 w-9"
            onClick={stop}
            disabled={busy}
            aria-label="Finalizar"
            title="Finalizar"
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={() => setEditOpen(true)}
            disabled={busy}
            aria-label="Editar"
            title="Editar descansos y comentario"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <EditDialog entry={entry} open={editOpen} onOpenChange={setEditOpen} onChanged={onChanged} />
    </div>
  );
}

// ---- panel -----------------------------------------------------------------

export function ActiveTasksPanel() {
  const { activeEntries, isLoading, refreshActiveEntry } = useActiveTimeEntry();
  const [now, setNow] = useState(() => Date.now());

  // Tick por segundo para el cronómetro en vivo.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-5 w-5" />
          Tareas activas
          {activeEntries.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {activeEntries.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && activeEntries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : activeEntries.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-8 text-center text-muted-foreground">
            <Clock className="h-8 w-8 opacity-40" />
            <p className="text-sm">No hay tareas corriendo.</p>
            <p className="text-xs">Iniciá una o varias desde el Time Tracker.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeEntries.map((entry) => (
              <ActiveTaskCard key={entry.id} entry={entry} now={now} onChanged={refreshActiveEntry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

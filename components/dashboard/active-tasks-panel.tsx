"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square, Pencil, Clock, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationMinutes } from "@/lib/utils/duration";
import { formatDateTime24 } from "@/lib/date-format";
import { toast } from "@/hooks/use-toast";
import {
  useActiveTimeEntry,
  type ActiveTimeEntry,
} from "@/contexts/active-time-entry-context";

// ---- helpers ---------------------------------------------------------------

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

// ---- single active task card ----------------------------------------------

function ActiveTaskCard({
  entry,
  now,
}: {
  entry: ActiveTimeEntry;
  now: number;
}) {
  const router = useRouter();
  const { pauseActiveEntry, resumeActiveEntry, stopActiveEntry } = useActiveTimeEntry();
  const [busy, setBusy] = useState(false);

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

  // Editar abre el modal COMPLETO de Mis Horas (tiempos, descansos, comentario,
  // paquete) en vez de un modal reducido.
  const edit = () => router.push(`/dashboard/my-hours?edit=${entry.id}`);

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
            onClick={edit}
            disabled={busy}
            aria-label="Editar"
            title="Editar (tiempos, descansos, comentario)"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- panel -----------------------------------------------------------------

export function ActiveTasksPanel() {
  const { activeEntries, isLoading } = useActiveTimeEntry();
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
              <ActiveTaskCard key={entry.id} entry={entry} now={now} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

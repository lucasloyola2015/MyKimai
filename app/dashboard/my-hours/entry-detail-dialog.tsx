"use client";

import { Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { arFormat } from "@/lib/timezone";
import { liveAmount, liveTotals } from "@/lib/utils/entry-live";

const hm = (d: Date | string) => arFormat(d, "HH:mm");
const hours = (min: number) => `${(min / 60).toFixed(2)}h`;

/** Detalle de solo lectura de una entrada de tiempo (lo abre la vista Day). */
export function EntryDetailDialog({
  entry,
  now,
  onOpenChange,
  onEdit,
}: {
  entry: any | null;
  now: number;
  onOpenChange: (open: boolean) => void;
  onEdit: (entry: any) => void;
}) {
  const task = entry?.tasks;
  const project = task?.projects;
  const client = project?.clients;
  const totals = entry ? liveTotals(entry, now) : null;
  const amount = entry && totals ? liveAmount(entry, totals.neto) : 0;
  const breaks: any[] = entry
    ? [...(entry.time_entry_breaks ?? [])].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    : [];

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        {entry && totals && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="truncate">{entry.title || task?.name || "—"}</span>
                {entry.source === "api" && (
                  <span className="text-sm" title="Cargada por un agente de IA (API)">🤖</span>
                )}
              </DialogTitle>
              <DialogDescription>
                {client?.name} · {project?.name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="font-medium">{arFormat(entry.start_time, "dd/MM/yyyy")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Horario</p>
                  <p className="font-medium font-mono">
                    {hm(entry.start_time)} – {entry.end_time ? hm(entry.end_time) : "en curso"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Bruto</p>
                  <p className="font-mono">{hours(totals.bruto)}</p>
                </div>
                <div>
                  <p className="text-xs text-orange-500">Pausas</p>
                  <p className="font-mono text-orange-600 dark:text-orange-400">{hours(totals.pausas)}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-500">Neto</p>
                  <p className="font-mono font-bold text-blue-700 dark:text-blue-400">{hours(totals.neto)}</p>
                </div>
              </div>

              {breaks.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Pausas</p>
                  <ul className="space-y-0.5 font-mono text-xs">
                    {breaks.map((b) => (
                      <li key={b.id}>
                        {hm(b.start_time)} – {b.end_time ? hm(b.end_time) : "en curso"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Inversión</p>
                  <p className="font-bold">
                    {amount.toFixed(2)} <span className="text-xs font-normal opacity-60">{project?.currency}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!entry.billable && (
                    <span className="flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
                      <ShieldCheck className="h-3 w-3" /> No facturable
                    </span>
                  )}
                  {entry.is_billed && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                      Facturada
                    </span>
                  )}
                </div>
              </div>

              {entry.description && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Descripción</p>
                  <p className="whitespace-pre-wrap">{entry.description}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button onClick={() => onEdit(entry)}>
                <Pencil className="mr-2 h-4 w-4" /> Editar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

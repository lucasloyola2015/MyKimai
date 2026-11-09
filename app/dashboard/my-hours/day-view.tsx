"use client";

import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Eye, Pencil } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AR_TZ, arDayKey, arFormat } from "@/lib/timezone";
import { liveAmount, liveTotals } from "@/lib/utils/entry-live";
import {
  arDayBounds,
  axisPercent,
  boundaryMarks,
  dayAxis,
  dayTotals,
  groupRowsByProject,
  shiftDayKey,
  workedSegments,
  type Interval,
} from "@/lib/utils/day-view";

const hm = (t: Date | string | number) => arFormat(t, "HH:mm");
/** Distancia mínima (en % del eje) entre dos etiquetas de hora para que no se pisen. */
const MIN_LABEL_GAP = 4;

interface DayEntry {
  id: string;
  start_time: Date;
  projectId: string;
  projectName: string;
  clientName: string;
  raw: any;
  segments: Interval[];
  span: Interval;
  netoMin: number;
}

/**
 * Vista "Day" de Mis Horas: un día en hora Argentina, una fila por
 * cliente/proyecto y todas las líneas de tiempo con la misma escala. Las líneas
 * de puntos marcan el inicio y el fin de cada tarea y cruzan todas las filas,
 * para ver la distribución y los solapamientos. Solo se dibuja lo trabajado.
 */
export function DayView({
  dayKey,
  onDayChange,
  entries,
  loading,
  now,
  onEdit,
  onDetail,
}: {
  dayKey: string;
  onDayChange: (dayKey: string) => void;
  entries: any[];
  loading: boolean;
  now: number;
  onEdit: (entry: any) => void;
  onDetail: (entry: any) => void;
}) {
  const bounds = useMemo(() => arDayBounds(dayKey), [dayKey]);
  const today = arDayKey(now);

  const dayEntries: DayEntry[] = useMemo(
    () =>
      entries
        .map((e) => {
          const project = e.tasks?.projects;
          const segments = workedSegments(e, now, bounds);
          return {
            id: e.id,
            start_time: new Date(e.start_time),
            projectId: project?.id ?? e.task_id,
            projectName: project?.name ?? "—",
            clientName: project?.clients?.name ?? "—",
            raw: e,
            segments,
            span: segments.length
              ? { start: segments[0].start, end: segments[segments.length - 1].end }
              : { start: 0, end: 0 },
            netoMin: liveTotals(e, now).neto,
          };
        })
        .filter((e) => e.segments.length > 0),
    [entries, now, bounds]
  );

  const rows = useMemo(() => groupRowsByProject(dayEntries), [dayEntries]);
  const axis = useMemo(
    () => dayAxis(dayEntries.flatMap((e) => e.segments), bounds.start),
    [dayEntries, bounds]
  );
  const marks = useMemo(() => boundaryMarks(dayEntries.map((e) => e.span)), [dayEntries]);
  const totals = useMemo(
    () =>
      dayTotals(
        dayEntries.map((e) => ({
          netoMin: e.netoMin,
          amount: liveAmount(e.raw, e.netoMin),
          currency: e.raw.tasks?.projects?.currency ?? "USD",
        }))
      ),
    [dayEntries]
  );

  const pct = (t: number) => axisPercent(t, bounds.start, axis.fromHour, axis.toHour);
  const span = axis.toHour - axis.fromHour;
  const hourStep = span > 12 ? 2 : 1;
  const hourTicks: number[] = [];
  for (let h = axis.fromHour; h <= axis.toHour; h += hourStep) hourTicks.push(h);

  // Etiquetas HH:mm de las líneas de puntos, salteando las que se pisarían.
  const markLabels: { t: number; p: number }[] = [];
  for (const t of marks) {
    const p = pct(t);
    if (markLabels.length === 0 || p - markLabels[markLabels.length - 1].p >= MIN_LABEL_GAP) {
      markLabels.push({ t, p });
    }
  }

  const gridCols = "grid grid-cols-[6rem_minmax(0,1fr)_6.25rem] sm:grid-cols-[13rem_minmax(0,1fr)_6.5rem]";

  /** Fondo compartido por todas las filas: horas en punto y líneas de puntos. */
  const guides = (
    <>
      {hourTicks.map((h) => (
        <div
          key={`h${h}`}
          className="absolute inset-y-0 border-l border-slate-100 dark:border-slate-800/70"
          style={{ left: `${((h - axis.fromHour) / span) * 100}%` }}
        />
      ))}
      {marks.map((t) => (
        <div
          key={`m${t}`}
          className="absolute inset-y-0 border-l border-dashed border-slate-400/80 dark:border-slate-500/70"
          style={{ left: `${pct(t)}%` }}
        />
      ))}
    </>
  );

  const label = (e: DayEntry) =>
    `${hm(e.span.start)}–${e.raw.end_time ? hm(e.span.end) : "ahora"} · ${e.raw.title || e.raw.tasks?.name || "—"}`;

  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-none rounded-l-md"
                onClick={() => onDayChange(shiftDayKey(dayKey, -1))}
                aria-label="Día anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-none border-x px-3"
                onClick={() => onDayChange(today)}
                disabled={dayKey === today}
              >
                Hoy
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-none rounded-r-md"
                onClick={() => onDayChange(shiftDayKey(dayKey, 1))}
                aria-label="Día siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-lg font-semibold capitalize">
              {formatInTimeZone(bounds.start, AR_TZ, "EEEE dd/MM/yyyy", { locale: es })}
            </h2>
          </div>

          {/* Contador global de la jornada (clientes seleccionados). */}
          <div className="flex items-center gap-4 rounded-lg border bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 leading-none mb-0.5">Neto</p>
              <p className="font-mono text-sm font-black text-blue-700 dark:text-blue-400 leading-none">
                {(totals.netoMin / 60).toFixed(2)}h
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-0.5">Costo</p>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 leading-none">
                {totals.byCurrency.length === 0
                  ? "—"
                  : totals.byCurrency.map((c, i) => (
                      <span key={c.currency}>
                        {i > 0 && <span className="mx-1 font-normal opacity-40">+</span>}
                        {c.amount.toFixed(2)} <span className="text-[9px] font-medium opacity-40">{c.currency}</span>
                      </span>
                    ))}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <p className="py-12 text-center text-muted-foreground">Cargando...</p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No hay horas este día para los clientes seleccionados.
          </p>
        ) : (
          <div className="rounded-lg border dark:border-slate-800">
            {/* Eje: horas en punto y los horarios de inicio/fin de cada tarea. */}
            <div className={cn(gridCols, "border-b dark:border-slate-800")}>
              <div />
              <div className="relative h-10">
                {guides}
                {hourTicks.map((h, i) => (
                  <span
                    key={h}
                    className="absolute top-0.5 bg-card px-0.5 text-[10px] font-medium text-muted-foreground"
                    style={{
                      left: `${((h - axis.fromHour) / span) * 100}%`,
                      transform: i === 0 ? "none" : i === hourTicks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                    }}
                  >
                    {String(h).padStart(2, "0")}h
                  </span>
                ))}
                {markLabels.map(({ t, p }) => (
                  <span
                    key={t}
                    className="absolute bottom-0.5 bg-card px-0.5 font-mono text-[9px] text-slate-500"
                    style={{ left: `${p}%`, transform: p > 92 ? "translateX(-100%)" : p < 4 ? "none" : "translateX(-50%)" }}
                  >
                    {hm(t)}
                  </span>
                ))}
              </div>
              <div />
            </div>

            {rows.map((row) => {
              const rowNeto = row.entries.reduce((s, e) => s + e.netoMin, 0);
              return (
                <div key={row.projectId} className={cn(gridCols, "border-b last:border-b-0 dark:border-slate-800")}>
                  <div className="min-w-0 px-2 py-2 sm:px-3">
                    <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      {row.clientName}
                    </p>
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100" title={row.projectName}>
                      {row.projectName}
                    </p>
                    <p className="font-mono text-[10px] text-blue-700 dark:text-blue-400">{(rowNeto / 60).toFixed(2)}h</p>
                  </div>

                  <div className="relative min-h-[3.5rem]">
                    {guides}
                    {row.entries.flatMap((e) =>
                      e.segments.map((s, i) => (
                        <button
                          key={`${e.id}-${i}`}
                          type="button"
                          onClick={() => onDetail(e.raw)}
                          title={label(e)}
                          className={cn(
                            "absolute top-1/2 h-5 -translate-y-1/2 rounded-sm transition-opacity hover:opacity-80",
                            e.raw.end_time
                              ? "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.45)]"
                              : "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.45)]",
                            !e.raw.billable && "opacity-50"
                          )}
                          style={{ left: `${pct(s.start)}%`, width: `max(${pct(s.end) - pct(s.start)}%, 2px)` }}
                        />
                      ))
                    )}
                  </div>

                  <div className="flex items-center justify-center px-1">
                    <RowActions entries={row.entries} label={label} onEdit={onEdit} onDetail={onDetail} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Editar / Ver detalle. Si el proyecto tiene varias tareas ese día, se elige cuál. */
function RowActions({
  entries,
  label,
  onEdit,
  onDetail,
}: {
  entries: DayEntry[];
  label: (e: DayEntry) => string;
  onEdit: (entry: any) => void;
  onDetail: (entry: any) => void;
}) {
  const boxClass =
    "flex items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950";
  const btnClass = "h-8 w-8 rounded-none text-slate-400 transition-colors hover:bg-white dark:hover:bg-slate-900";

  if (entries.length === 1) {
    const e = entries[0];
    return (
      <div className={boxClass}>
        <Button
          variant="ghost"
          size="icon"
          className={cn(btnClass, "border-r hover:text-primary dark:border-slate-800")}
          onClick={() => onEdit(e.raw)}
          aria-label="Editar"
          title="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(btnClass, "hover:text-blue-600")}
          onClick={() => onDetail(e.raw)}
          aria-label="Ver detalle"
          title="Ver detalle"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const menu = (icon: ReactNode, title: string, action: (entry: any) => void, extra: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn(btnClass, extra)} aria-label={title} title={title}>
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        {entries.map((e) => (
          <DropdownMenuItem key={e.id} onSelect={() => action(e.raw)}>
            {label(e)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className={boxClass}>
      {menu(<Pencil className="h-3.5 w-3.5" />, "Editar", onEdit, "border-r hover:text-primary dark:border-slate-800")}
      {menu(<Eye className="h-3.5 w-3.5" />, "Ver detalle", onDetail, "hover:text-blue-600")}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { editTimeEntrySegment, moveTimeEntryEdge } from "@/lib/actions/time-entries";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  applyEdge,
  arDayBounds,
  axisPercent,
  boundaryMarks,
  dayAxis,
  dayTotals,
  edgeLimits,
  groupRowsByProject,
  hourTicks,
  moveSegment,
  removeSegment,
  segmentMoveLimits,
  shiftDayKey,
  snapDelta,
  snapTime,
  taggedSegments,
  workedSegments,
  type EdgeRef,
  type Interval,
  type SegmentRef,
  type TaggedSegment,
} from "@/lib/utils/day-view";

const hm = (t: Date | string | number) => arFormat(t, "HH:mm");

// El calendario trabaja con fechas locales del navegador: solo se usa el año/mes/día.
const keyToLocalDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const localDateToKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Pista de la línea de tiempo: un margen a los lados para que la primera y la última barra no toquen el borde. */
const TRACK = "absolute inset-y-0 left-3 right-3";
/** Distancia mínima (en % del eje) entre dos etiquetas de hora para que no se pisen. */
const MIN_LABEL_GAP = 4;

interface DayEntry {
  id: string;
  start_time: Date;
  projectId: string;
  projectName: string;
  clientName: string;
  raw: any;
  segments: TaggedSegment[];
  span: Interval;
  netoMin: number;
}

/** Píxeles de distancia a los que un extremo se pega al inicio/fin de otra tarea. */
const SNAP_PX = 6;

/** Cambio sobre una entrada, para la vista previa (mientras se arrastra o se guarda). */
type EntryOp =
  | { type: "edge"; edge: EdgeRef; time: number }
  | { type: "segment"; segment: SegmentRef; delta: number }
  | { type: "remove"; segment: SegmentRef };

/** La entrada con el cambio aplicado; null = la entrada desaparece (se elimina entera). */
function applyOp(entry: any, op: EntryOp, now: number): any | null {
  if (op.type === "edge") return applyEdge(entry, op.edge, op.time);
  if (op.type === "segment") return moveSegment(entry, op.segment, op.delta, now);
  const r = removeSegment(entry, op.segment, now);
  return r.kind === "entry" ? r.entry : r.kind === "delete-entry" ? null : entry;
}

/** Arrastre en curso: un extremo (edge) o un bloque entero (segment). */
interface DragState {
  entryId: string;
  op: Extract<EntryOp, { type: "edge" | "segment" }>;
  /** edge: hora original del extremo. segment: inicio y fin originales del bloque. */
  original: Interval;
  /** Hora bajo el mouse al agarrar (para el corrimiento del bloque). */
  grab: number;
  /** edge: horas mínima y máxima. segment: corrimiento mínimo y máximo. */
  limits: Interval;
  /** Eje y orden de filas congelados mientras se arrastra, para que nada salte bajo el mouse. */
  axis: Interval;
  rowOrder: string[];
  track: { left: number; width: number };
  snaps: number[];
}

/** Menú del click derecho sobre un bloque. */
interface BlockMenu {
  x: number;
  y: number;
  entry: DayEntry;
  segment: TaggedSegment;
}

const segRef = (s: TaggedSegment): SegmentRef | null =>
  s.startEdge && s.endEdge ? { start: s.startEdge, end: s.endEdge } : null;

const EDGE_TEXT: Record<EdgeRef["kind"], string> = {
  "entry-start": "el inicio de la tarea",
  "entry-end": "el fin de la tarea",
  "break-start": "el inicio de la pausa",
  "break-end": "el fin de la pausa",
};

function signedMinutes(ms: number) {
  const m = Math.round(ms / 60000);
  const abs = Math.abs(m);
  const txt = abs >= 60 ? `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}` : `${abs} min`;
  return `${m < 0 ? "−" : "+"}${txt}`;
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
  onChanged,
}: {
  dayKey: string;
  onDayChange: (dayKey: string) => void;
  entries: any[];
  loading: boolean;
  now: number;
  onEdit: (entry: any) => void;
  /** Recarga las horas tras mover un horario. */
  onChanged: () => Promise<void>;
}) {
  const [hover, setHover] = useState<{ entry: DayEntry; x: number; y: number } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Lo soltado/elegido que se está guardando: se sigue mostrando hasta que llega la recarga.
  const [saving, setSaving] = useState<{ entryId: string; op: EntryOp } | null>(null);
  const [menu, setMenu] = useState<BlockMenu | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const bounds = useMemo(() => arDayBounds(dayKey), [dayKey]);
  const today = arDayKey(now);

  // Escape cancela el arrastre (vuelve todo a como estaba) y cierra el menú.
  useEffect(() => {
    if (!drag && !menu) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setDrag(null);
        setMenu(null);
      }
    };
    const close = () => setMenu(null);
    window.addEventListener("keydown", onKey);
    if (menu) {
      window.addEventListener("pointerdown", close);
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [drag, menu]);

  const preview: { entryId: string; op: EntryOp } | null = drag ?? saving;
  const shownEntries = useMemo(
    () =>
      preview
        ? entries.flatMap((e) => {
            if (e.id !== preview.entryId) return [e];
            const next = applyOp(e, preview.op, now);
            return next ? [next] : [];
          })
        : entries,
    [entries, preview, now]
  );
  // Minutos trabajados que suma o resta lo que se está cambiando (las horas de una
  // tarea terminada vienen de la DB; esto es solo la vista previa hasta recargar).
  const previewDeltaMin = useMemo(() => {
    if (!preview) return 0;
    const original = entries.find((e) => e.id === preview.entryId);
    if (!original?.end_time) return 0; // una tarea en curso ya se calcula en vivo
    const next = applyOp(original, preview.op, now);
    if (!next) return 0;
    const worked = (e: any) => workedSegments(e, now).reduce((s, x) => s + x.end - x.start, 0);
    return Math.round((worked(next) - worked(original)) / 60000);
  }, [entries, preview, now]);

  const dayEntries: DayEntry[] = useMemo(
    () =>
      shownEntries
        .map((e) => {
          const project = e.tasks?.projects;
          const segments = taggedSegments(e, now, bounds);
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
            netoMin: liveTotals(e, now).neto + (e.id === preview?.entryId ? previewDeltaMin : 0),
          };
        })
        .filter((e) => e.segments.length > 0),
    [shownEntries, now, bounds, preview, previewDeltaMin]
  );

  const frozenOrder = drag?.rowOrder;
  const rows = useMemo(() => {
    const r = groupRowsByProject(dayEntries);
    if (!frozenOrder) return r;
    const pos = (id: string) => {
      const i = frozenOrder.indexOf(id);
      return i < 0 ? frozenOrder.length : i;
    };
    return [...r].sort((a, b) => pos(a.projectId) - pos(b.projectId));
  }, [dayEntries, frozenOrder]);
  const liveAxis = useMemo(
    () => dayAxis(dayEntries.flatMap((e) => e.segments), bounds.start),
    [dayEntries, bounds]
  );
  const axis = drag ? drag.axis : liveAxis;
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

  const pct = (t: number) => axisPercent(t, axis);
  const ticks = hourTicks(axis, bounds.start);
  /** Ancla de una etiqueta según dónde cae, para que no se salga del eje. */
  const anchor = (p: number) => (p < 4 ? "none" : p > 96 ? "translateX(-100%)" : "translateX(-50%)");

  // Etiquetas HH:mm de las líneas de puntos, salteando las que se pisarían.
  const markLabels: { t: number; p: number }[] = [];
  for (const t of marks) {
    const p = pct(t);
    if (markLabels.length === 0 || p - markLabels[markLabels.length - 1].p >= MIN_LABEL_GAP) {
      markLabels.push({ t, p });
    }
  }

  const gridCols = "grid grid-cols-[6rem_minmax(0,1fr)_3.5rem] sm:grid-cols-[13rem_minmax(0,1fr)_3.75rem]";

  /** Fondo compartido por todas las filas: horas en punto y líneas de puntos. */
  const guides = (
    <>
      {ticks.map(({ t }) => (
        <div
          key={`h${t}`}
          className="absolute inset-y-0 border-l border-slate-100 dark:border-slate-800/70"
          style={{ left: `${pct(t)}%` }}
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

  // ── Arrastrar extremos y bloques, y el menú del click derecho ─────────────
  const neighborsOf = (e: DayEntry) =>
    dayEntries.filter((x) => x.projectId === e.projectId && x.id !== e.id).map((x) => x.span);

  const pointerTime = (clientX: number, d: Pick<DragState, "axis" | "track">) =>
    d.axis.start + ((clientX - d.track.left) / d.track.width) * (d.axis.end - d.axis.start);

  /** Arranca un arrastre: de un extremo (manija) o del bloque entero (cuerpo de la barra). */
  const startDrag = (
    ev: React.PointerEvent<HTMLElement>,
    e: DayEntry,
    op: DragState["op"],
    original: Interval,
    limits: Interval | null
  ) => {
    if (ev.button !== 0 || saving || !limits) return;
    const trackEl = ev.currentTarget.closest("[data-track]");
    if (!trackEl) return;
    ev.preventDefault();
    ev.stopPropagation();
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId); // sigue al mouse aunque salga de la barra
    } catch {
      /* puntero ya liberado: el arrastre igual funciona mientras esté encima */
    }
    const rect = trackEl.getBoundingClientRect();
    const track = { left: rect.left, width: rect.width };
    setHover(null);
    setMenu(null);
    setDrag({
      entryId: e.id,
      op,
      original,
      grab: pointerTime(ev.clientX, { axis: liveAxis, track }),
      limits,
      axis: liveAxis,
      rowOrder: rows.map((r) => r.projectId),
      track,
      snaps: dayEntries.filter((x) => x.id !== e.id).flatMap((x) => [x.span.start, x.span.end]),
    });
  };

  const startEdgeDrag = (ev: React.PointerEvent<HTMLElement>, e: DayEntry, edge: EdgeRef, at: number) =>
    startDrag(ev, e, { type: "edge", edge, time: at }, { start: at, end: at }, edgeLimits(e.raw, edge, now, bounds, neighborsOf(e)));

  const startSegmentDrag = (ev: React.PointerEvent<HTMLElement>, e: DayEntry, s: TaggedSegment) => {
    const segment = segRef(s);
    if (!segment || e.raw.is_billed) return;
    startDrag(
      ev,
      e,
      { type: "segment", segment, delta: 0 },
      { start: s.start, end: s.end },
      segmentMoveLimits(e.raw, segment, now, bounds, neighborsOf(e))
    );
  };

  const moveDrag = (ev: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const threshold = (SNAP_PX / d.track.width) * (d.axis.end - d.axis.start);
    const t = pointerTime(ev.clientX, d);
    const clamp = (x: number) => Math.min(d.limits.end, Math.max(d.limits.start, x));
    if (d.op.type === "edge") {
      const time = clamp(snapTime(t, d.snaps, threshold));
      if (time !== d.op.time) setDrag({ ...d, op: { ...d.op, time } });
    } else {
      const delta = clamp(snapDelta([d.original.start, d.original.end], t - d.grab, d.snaps, threshold));
      if (delta !== d.op.delta) setDrag({ ...d, op: { ...d.op, delta } });
    }
  };

  /** Guarda un cambio mostrando la vista previa hasta que llega la recarga. */
  const persist = async (entryId: string, op: EntryOp, save: () => Promise<{ success: boolean; error?: string }>, okText: string) => {
    setSaving({ entryId, op });
    try {
      const res = await save();
      if (!res.success) {
        toast({ title: "No se pudo guardar", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Horario actualizado", description: okText });
      }
      await onChanged();
    } catch (error) {
      console.error("Error al guardar el horario:", error);
      toast({ title: "No se pudo guardar", description: "Error de conexión. Probá de nuevo.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const endDrag = async () => {
    const d = dragRef.current;
    if (!d) return;
    // El pointerup de la manija sube también a la barra: se suelta una sola vez.
    dragRef.current = null;
    setDrag(null);
    const op = d.op;
    if (op.type === "edge") {
      if (Math.abs(op.time - d.original.start) < 30_000) return; // fue un clic, no un arrastre
      await persist(
        d.entryId,
        op,
        () =>
          moveTimeEntryEdge({
            entryId: d.entryId,
            edge: op.edge.kind,
            breakId: "breakId" in op.edge ? op.edge.breakId : undefined,
            time: new Date(op.time),
          }),
        `Se movió ${EDGE_TEXT[op.edge.kind]}: ${hm(d.original.start)} → ${hm(op.time)} (${signedMinutes(op.time - d.original.start)}).`
      );
    } else {
      if (Math.abs(op.delta) < 30_000) return;
      await persist(
        d.entryId,
        op,
        () => editTimeEntrySegment({ op: "move", entryId: d.entryId, segment: op.segment, deltaMs: Math.round(op.delta) }),
        `Bloque ${hm(d.original.start)}–${hm(d.original.end)} → ${hm(d.original.start + op.delta)}–${hm(d.original.end + op.delta)} (${signedMinutes(op.delta)}). El neto no cambia.`
      );
    }
  };

  const openMenu = (ev: React.MouseEvent<HTMLElement>, e: DayEntry, s: TaggedSegment) => {
    ev.preventDefault();
    if (dragRef.current || saving) return;
    setHover(null);
    setMenu({ x: ev.clientX, y: ev.clientY, entry: e, segment: s });
  };

  const removeBlock = async (m: BlockMenu) => {
    setMenu(null);
    const segment = segRef(m.segment);
    if (!segment) return;
    const only = m.entry.segments.length === 1 && segment.start.kind === "entry-start" && segment.end.kind === "entry-end";
    if (only && !confirm("Este es el único bloque de la tarea: se elimina la tarea entera. ¿Seguro?")) return;
    const between = segment.start.kind === "break-end" && segment.end.kind === "break-start";
    await persist(
      m.entry.id,
      { type: "remove", segment },
      () => editTimeEntrySegment({ op: "remove", entryId: m.entry.id, segment }),
      only
        ? "Se eliminó la tarea."
        : between
          ? `Se eliminó el bloque ${hm(m.segment.start)}–${hm(m.segment.end)} y las dos pausas quedaron unificadas.`
          : `Se eliminó el bloque ${hm(m.segment.start)}–${hm(m.segment.end)} y se ajustó el horario de la tarea.`
    );
  };

  /** Manija en un extremo de un tramo: arrastrarla mueve ese horario. */
  const handle = (e: DayEntry, edge: EdgeRef | null, at: number, side: "left" | "right") => {
    if (!edge || e.raw.is_billed) return null;
    const isBreak = edge.kind === "break-start" || edge.kind === "break-end";
    const dragged = drag?.entryId === e.id && drag.op.type === "edge" ? drag.op.edge : null;
    const active =
      !!dragged && dragged.kind === edge.kind &&
      (!("breakId" in edge) || ("breakId" in dragged && dragged.breakId === edge.breakId));
    return (
      <div
        role="slider"
        aria-label={`Mover ${EDGE_TEXT[edge.kind]}`}
        aria-valuetext={hm(at)}
        title={`Arrastrá para mover ${EDGE_TEXT[edge.kind]} (${hm(at)})`}
        onPointerDown={(ev) => startEdgeDrag(ev, e, edge, at)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
        className={cn(
          "absolute -inset-y-1.5 z-10 flex w-3 cursor-ew-resize touch-none items-center justify-center",
          side === "left" ? "-left-1.5" : "-right-1.5"
        )}
      >
        <span
          className={cn(
            "h-full w-1 rounded-full border shadow-sm transition-opacity",
            isBreak ? "border-orange-500 bg-orange-100" : "border-blue-700 bg-white",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        />
      </div>
    );
  };

  /** Etiqueta flotante con la hora (extremo) o el horario nuevo (bloque) mientras se arrastra. */
  const dragLabel = (d: DragState) => {
    if (d.op.type === "edge") {
      return { at: d.op.time, text: hm(d.op.time), delta: d.op.time - d.original.start };
    }
    const s = d.original.start + d.op.delta;
    const e = d.original.end + d.op.delta;
    return { at: (s + e) / 2, text: `${hm(s)}–${hm(e)}`, delta: d.op.delta };
  };

  return (
    <Card className={cn(drag && "select-none", drag?.op.type === "edge" && "cursor-ew-resize", drag?.op.type === "segment" && "cursor-grabbing")}>
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
              {/* La fecha va entre las flechas y abre un calendario para saltar a cualquier día. */}
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 items-center gap-2 border-x px-3 capitalize hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="Elegir fecha"
                  >
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-base font-semibold">{formatInTimeZone(bounds.start, AR_TZ, "EEEE dd/MM/yyyy", { locale: es })}</h2>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    locale={es}
                    weekStartsOn={1}
                    selected={keyToLocalDate(dayKey)}
                    defaultMonth={keyToLocalDate(dayKey)}
                    onSelect={(d) => {
                      if (!d) return;
                      onDayChange(localDateToKey(d));
                      setCalendarOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
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
            {/* Volver a hoy: solo aparece cuando se está viendo otro día. */}
            {dayKey === today ? (
              <span className="rounded-md bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
                Hoy
              </span>
            ) : (
              <Button variant="outline" size="sm" className="h-9" onClick={() => onDayChange(today)}>
                Ir a hoy
              </Button>
            )}
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
                <div className={TRACK}>
                  {guides}
                  {ticks.map(({ t, hour }) => (
                    <span
                      key={t}
                      className="absolute top-0.5 bg-card px-0.5 text-[10px] font-medium text-muted-foreground"
                      style={{ left: `${pct(t)}%`, transform: anchor(pct(t)) }}
                    >
                      {String(hour).padStart(2, "0")}h
                    </span>
                  ))}
                  {markLabels.map(({ t, p }) => (
                    <span
                      key={t}
                      className="absolute bottom-0.5 bg-card px-0.5 font-mono text-[9px] text-slate-500"
                      style={{ left: `${p}%`, transform: anchor(p) }}
                    >
                      {hm(t)}
                    </span>
                  ))}
                </div>
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
                    <div className={TRACK} data-track>
                    {guides}
                    {row.entries.flatMap((e) =>
                      e.segments.map((s, i) => (
                        <div
                          key={`${e.id}-${i}`}
                          aria-label={label(e)}
                          onMouseEnter={(ev) => !dragRef.current && !menu && setHover({ entry: e, x: ev.clientX, y: ev.clientY })}
                          onMouseMove={(ev) => !dragRef.current && !menu && setHover({ entry: e, x: ev.clientX, y: ev.clientY })}
                          onMouseLeave={() => setHover(null)}
                          onPointerDown={(ev) => startSegmentDrag(ev, e, s)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={() => setDrag(null)}
                          onContextMenu={(ev) => openMenu(ev, e, s)}
                          className={cn(
                            "group absolute top-1/2 h-5 -translate-y-1/2 touch-none rounded-sm",
                            !e.raw.is_billed && segRef(s) && "cursor-grab",
                            menu?.entry.id === e.id && menu.segment.start === s.start && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                            e.raw.end_time
                              ? "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.45)]"
                              : "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.45)]",
                            !e.raw.billable && "opacity-50",
                            saving?.entryId === e.id && "animate-pulse"
                          )}
                          style={{ left: `${pct(s.start)}%`, width: `max(${pct(s.end) - pct(s.start)}%, 2px)` }}
                        >
                          {handle(e, s.startEdge, s.start, "left")}
                          {handle(e, s.endEdge, s.end, "right")}
                        </div>
                      ))
                    )}
                    {/* Hora del extremo que se está arrastrando. */}
                    {drag && row.entries.some((e) => e.id === drag.entryId) && (() => {
                      const l = dragLabel(drag);
                      return (
                        <span
                          className="pointer-events-none absolute top-0 z-20 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow dark:bg-slate-100 dark:text-slate-900"
                          style={{ left: `${pct(l.at)}%`, transform: anchor(pct(l.at)) }}
                        >
                          {l.text}
                          <span className="ml-1 font-normal opacity-70">{signedMinutes(l.delta)}</span>
                        </span>
                      );
                    })()}
                    </div>
                  </div>

                  <div className="flex items-center justify-center px-1">
                    <RowActions entries={row.entries} label={label} onEdit={onEdit} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {hover && !drag && !menu && <EntryTooltip entry={hover.entry} x={hover.x} y={hover.y} now={now} />}
        {menu && (
          <BlockContextMenu
            menu={menu}
            onEdit={() => {
              setMenu(null);
              onEdit(menu.entry.raw);
            }}
            onRemove={() => removeBlock(menu)}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** Editar. Si el proyecto tiene varias tareas ese día, se elige cuál. */
function RowActions({
  entries,
  label,
  onEdit,
}: {
  entries: DayEntry[];
  label: (e: DayEntry) => string;
  onEdit: (entry: any) => void;
}) {
  const btnClass =
    "h-8 w-8 rounded-md border border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:bg-white hover:text-primary dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900";

  if (entries.length === 1) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={btnClass}
        onClick={() => onEdit(entries[0].raw)}
        aria-label="Editar"
        title="Editar"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={btnClass} aria-label="Editar" title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Editar</DropdownMenuLabel>
        {entries.map((e) => (
          <DropdownMenuItem key={e.id} onSelect={() => onEdit(e.raw)}>
            {label(e)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const TOOLTIP_W = 288; // w-72
const hours = (min: number) => `${(min / 60).toFixed(2)}h`;

/** Detalle de la tarea al pasar el mouse por su barra. Sigue al cursor y no se sale de la pantalla. */
function EntryTooltip({ entry, x, y, now }: { entry: DayEntry; x: number; y: number; now: number }) {
  const raw = entry.raw;
  const project = raw.tasks?.projects;
  const totals = liveTotals(raw, now);
  const amount = liveAmount(raw, totals.neto);
  const breaks: any[] = [...(raw.time_entry_breaks ?? [])].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const left = x + 14 + TOOLTIP_W > vw ? Math.max(8, x - 14 - TOOLTIP_W) : x + 14;
  const placeAbove = y > vh * 0.6;

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 w-72 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
      style={placeAbove ? { left, bottom: vh - y + 14 } : { left, top: y + 14 }}
    >
      <p className="flex items-center gap-1.5 text-sm font-bold leading-tight">
        <span className="line-clamp-2">{raw.title || raw.tasks?.name || "—"}</span>
        {raw.source === "api" && <span title="Cargada por un agente de IA">🤖</span>}
      </p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {entry.clientName} · {entry.projectName}
      </p>

      <p className="mt-2 font-mono">
        {hm(raw.start_time)} – {raw.end_time ? hm(raw.end_time) : "en curso"}
      </p>
      {breaks.length > 0 && (
        <p className="font-mono text-orange-600 dark:text-orange-400">
          Pausas: {breaks.map((b) => `${hm(b.start_time)}–${b.end_time ? hm(b.end_time) : "…"}`).join(", ")}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1 font-mono">
        <span className="text-muted-foreground">{hours(totals.bruto)}</span>
        <span className="text-orange-600 dark:text-orange-400">− {hours(totals.pausas)}</span>
        <span className="font-bold text-blue-700 dark:text-blue-400">= {hours(totals.neto)}</span>
        <span className="font-bold">
          {amount.toFixed(2)} <span className="text-[9px] font-normal opacity-60">{project?.currency}</span>
        </span>
      </div>

      {(!raw.billable || raw.is_billed) && (
        <div className="mt-2 flex gap-1.5">
          {!raw.billable && (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
              No facturable
            </span>
          )}
          {raw.is_billed && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              Facturada
            </span>
          )}
        </div>
      )}

      {raw.description && (
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap border-t pt-2 text-muted-foreground">{raw.description}</p>
      )}
    </div>
  );
}

const MENU_W = 256; // w-64

/**
 * Menú del click derecho sobre un bloque: editar la tarea o eliminar el bloque.
 * Explica qué va a pasar: entre dos pausas se unifican; el primero/último ajusta
 * el horario de la tarea; el único bloque elimina la tarea.
 */
function BlockContextMenu({ menu, onEdit, onRemove }: { menu: BlockMenu; onEdit: () => void; onRemove: () => void }) {
  const { entry, segment: s } = menu;
  const ref = segRef(s);
  const breaks: any[] = entry.raw.time_entry_breaks ?? [];
  const brk = (id: string) => breaks.find((b) => b.id === id);

  let removeLabel = "Eliminar bloque";
  let hint = "";
  let disabled: string | null = null;
  if (entry.raw.is_billed) {
    disabled = "Las horas facturadas no se pueden modificar.";
  } else if (!ref) {
    disabled = s.endEdge ? "El bloque sigue de otro día." : "El bloque está en curso.";
  } else if (ref.start.kind === "entry-start" && ref.end.kind === "entry-end") {
    removeLabel = "Eliminar tarea";
    hint = "Es el único bloque: se elimina la tarea entera.";
  } else if (ref.start.kind === "break-end" && ref.end.kind === "break-start") {
    const a = brk(ref.start.breakId);
    const b = brk(ref.end.breakId);
    hint = `Las pausas se unifican: ${hm(a.start_time)}–${b.end_time ? hm(b.end_time) : "…"}.`;
  } else if (ref.start.kind === "entry-start" && ref.end.kind === "break-start") {
    const b = brk(ref.end.breakId);
    if (!b.end_time) disabled = "La pausa que le sigue está en curso.";
    else hint = `La tarea pasa a empezar a las ${hm(b.end_time)}.`;
  } else if (ref.end.kind === "entry-end" && ref.start.kind === "break-end") {
    hint = `La tarea pasa a terminar a las ${hm(brk(ref.start.breakId).start_time)}.`;
  }

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const left = Math.max(8, Math.min(menu.x, vw - MENU_W - 8));
  const placeAbove = menu.y > vh - 200;

  return (
    <div
      role="menu"
      onPointerDown={(ev) => ev.stopPropagation()}
      onContextMenu={(ev) => ev.preventDefault()}
      className="fixed z-50 w-64 overflow-hidden rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
      style={placeAbove ? { left, bottom: vh - menu.y } : { left, top: menu.y }}
    >
      <div className="px-2 py-1.5">
        <p className="font-mono text-xs font-bold">
          {hm(s.start)}–{hm(s.end)}
          <span className="ml-1 font-normal text-muted-foreground">{signedMinutes(s.end - s.start).slice(1)}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{entry.raw.title || entry.raw.tasks?.name || "—"}</p>
      </div>
      <div className="-mx-1 my-1 h-px bg-muted" />
      <button
        type="button"
        role="menuitem"
        onClick={onEdit}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus:bg-accent focus:outline-none"
      >
        <Pencil className="h-3.5 w-3.5" /> Editar tarea…
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onRemove}
        disabled={!!disabled}
        className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent dark:text-red-400 dark:hover:bg-red-500/10"
      >
        <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {removeLabel}
          <span className="block text-[11px] font-normal text-muted-foreground">{disabled ?? hint}</span>
        </span>
      </button>
    </div>
  );
}

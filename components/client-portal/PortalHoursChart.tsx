"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer,
    Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { Calendar, ChevronLeft, ChevronRight, ArrowUp } from "lucide-react";
import {
    getPortalChartData,
    getPortalChartDataInRange,
    getPortalChartDataHourly,
    type PortalChartPeriod,
    type PortalChartDataPoint,
    type PortalHourlyDataPoint,
} from "@/lib/actions/portal";
import { Loader2 } from "lucide-react";
import {
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    startOfDay,
    endOfDay,
    parse,
    format,
    subDays,
} from "date-fns";
import { es } from "date-fns/locale";

const COLORS_LIGHT = ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe"];
const COLORS_DARK = ["#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe"];
const WEEK_STARTS_ON = 1;

export type PortalDrillLevel = "month" | "week" | "day" | "hour";

export interface PortalHoursChartProps {
    /** Nivel actual de drill: mes, semana, día, hora */
    drillLevel: PortalDrillLevel;
    /** Rango enfocado al hacer drill; null cuando drillLevel === "month" */
    focusRange: { start: Date; end: Date } | null;
    /** Al hacer click en una barra: bajar al siguiente nivel */
    onDrillDown: (range: { start: Date; end: Date }) => void;
    /** Volver al nivel superior */
    onReset: () => void;
    /** Al seleccionar Día/Semana/Mes: enfocar hoy, esta semana o este mes */
    onPeriodSelect?: (period: PortalChartPeriod, range?: { start: Date; end: Date }) => void;
    /** Navegar anterior/siguiente en modo semana (por mes) o día (por semana). delta: -1=anterior, 1=siguiente */
    onNavigate?: (delta: number) => void;
    className?: string;
}

export function PortalHoursChart({
    drillLevel,
    focusRange,
    onDrillDown,
    onReset,
    onPeriodSelect,
    onNavigate,
    className,
}: PortalHoursChartProps) {
    const [period, setPeriod] = useState<PortalChartPeriod>("month");
    const [periodOffset, setPeriodOffset] = useState(0);
    const [result, setResult] = useState<{
        data: PortalChartDataPoint[];
        dateRange: { start: string; end: string };
    } | null>(null);
    const [resultHourly, setResultHourly] = useState<{
        data: PortalHourlyDataPoint[];
        dateRange: { start: string; end: string };
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const COLORS = isDark ? COLORS_DARK : COLORS_LIGHT;
    const chartGridStroke = isDark ? "hsl(0,0%,25%)" : "#e5e7eb";
    const chartTickFill = isDark ? "hsl(215,15%,75%)" : undefined;

    const showHourlyView =
        (drillLevel === "month" && period === "day") || drillLevel === "hour";

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setResultHourly(null);
        setResult(null);

        if (showHourlyView) {
            if (drillLevel === "hour" && !focusRange) {
                setLoading(false);
                return () => { cancelled = true; };
            }
            const dayToFetch =
                drillLevel === "hour" && focusRange
                    ? focusRange.start
                    : periodOffset === 0
                      ? new Date()
                      : subDays(new Date(), Math.abs(periodOffset));
            const dayStart = startOfDay(dayToFetch);
            getPortalChartDataHourly(dayStart.toISOString()).then((res) => {
                if (!cancelled) {
                    setResultHourly(res);
                    setLoading(false);
                }
            });
        } else if (drillLevel === "month") {
            getPortalChartData(period, periodOffset).then((res) => {
                if (!cancelled) {
                    setResult(res);
                    setLoading(false);
                }
            });
        } else if (focusRange) {
            const periodType = drillLevel === "week" ? "week" : "day";
            getPortalChartDataInRange(
                periodType,
                focusRange.start.toISOString(),
                focusRange.end.toISOString()
            ).then((res) => {
                if (!cancelled) {
                    setResult(res);
                    setLoading(false);
                }
            });
        } else {
            setLoading(false);
        }
        return () => {
            cancelled = true;
        };
    }, [drillLevel, focusRange, period, periodOffset, showHourlyView]);

    const projectKeys = result?.data?.length
        ? (Array.from(
              new Set(
                  result.data.flatMap((d) =>
                      Object.keys(d).filter((k) => k !== "period" && k !== "total")
                  )
              )
          ) as string[])
        : [];
    const maxHours = result?.data ? Math.max(...result.data.map((d) => d.total), 0) : 0;

    const handleBarClick = (payload: PortalChartDataPoint) => {
        if (!payload?.period) return;
        const clickedPeriod = payload.period as string;

        if (drillLevel === "month") {
            try {
                const monthDate = parse(clickedPeriod, "MMM yyyy", new Date(), { locale: es });
                const start = startOfMonth(monthDate);
                const end = endOfMonth(monthDate);
                onDrillDown({ start, end });
            } catch {
                // ignore parse error
            }
        } else if (drillLevel === "week" && focusRange) {
            try {
                const match = clickedPeriod.match(/Sem (\d{2}\/\d{2})/);
                if (!match) return;
                const weekDate = parse(match[1], "dd/MM", new Date());
                weekDate.setFullYear(focusRange.start.getFullYear());
                const start = startOfWeek(weekDate, { weekStartsOn: WEEK_STARTS_ON });
                const end = endOfWeek(weekDate, { weekStartsOn: WEEK_STARTS_ON });
                onDrillDown({ start, end });
            } catch {
                // ignore
            }
        } else if (drillLevel === "day" && focusRange) {
            try {
                // payload.period es "dd/MM" para días
                const dayDate = parse(clickedPeriod, "dd/MM", new Date());
                dayDate.setFullYear(focusRange.start.getFullYear());
                const start = startOfDay(dayDate);
                const end = endOfDay(dayDate);
                onDrillDown({ start, end });
            } catch {
                // ignore
            }
        }
    };

    const isClickable =
        (drillLevel === "month" && period !== "day") ||
        drillLevel === "week" ||
        drillLevel === "day";
    const showVolver = drillLevel !== "month";

    return (
        <Card className={cn("border border-border bg-card shadow-sm flex flex-col min-h-[420px] h-full", className)}>
            <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            Horas trabajadas
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {drillLevel === "month" && "Por día, semana o mes. Clic en una barra para bajar a detalle."}
                            {drillLevel === "week" && "Semanas del mes seleccionado. Clic en una barra para ver días."}
                            {drillLevel === "day" && "Días de la semana seleccionada. Clic en una barra para ver horas."}
                            {drillLevel === "hour" && "Minutos trabajados por hora (% de cada hora)."}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {showVolver && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onReset}
                                className="min-h-[36px] gap-1"
                            >
                                <ArrowUp className="h-3.5 w-3.5" />
                                Volver
                            </Button>
                        )}
                        {drillLevel === "month" && (
                            <>
                                <Button
                                    variant={period === "day" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                        setPeriod("day");
                                        setPeriodOffset(0);
                                        onPeriodSelect?.("day");
                                    }}
                                    className="min-w-[70px]"
                                >
                                    Día
                                </Button>
                                <Button
                                    variant={period === "week" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                        setPeriod("week");
                                        setPeriodOffset(0);
                                        const now = new Date();
                                        const weekStart = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
                                        const weekEnd = endOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
                                        onPeriodSelect?.("week", { start: weekStart, end: weekEnd });
                                    }}
                                    className="min-w-[70px]"
                                >
                                    Semana
                                </Button>
                                <Button
                                    variant={period === "month" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                        setPeriod("month");
                                        setPeriodOffset(0);
                                        onPeriodSelect?.("month");
                                    }}
                                    className="min-w-[70px]"
                                >
                                    Mes
                                </Button>
                                <div className="flex items-center gap-1 border-l pl-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPeriodOffset((p) => p - 1)}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPeriodOffset(0)}
                                        disabled={periodOffset === 0}
                                    >
                                        <Calendar className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPeriodOffset((p) => Math.min(0, p + 1))}
                                        disabled={periodOffset === 0}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </>
                        )}
                        {(drillLevel === "week" || drillLevel === "day") && focusRange && (
                            <div className="flex items-center gap-1 border-l pl-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => onNavigate?.(-1)}
                                    aria-label="Anterior"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => onNavigate?.(1)}
                                    aria-label="Siguiente"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
                {((showHourlyView && resultHourly) || result)?.dateRange?.start && (
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                        {(showHourlyView && resultHourly
                            ? resultHourly.dateRange
                            : result!.dateRange
                        ).start}{" "}
                        – {(showHourlyView && resultHourly ? resultHourly.dateRange : result!.dateRange).end}
                    </p>
                )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : showHourlyView ? (
                    resultHourly?.data?.length ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart
                                data={resultHourly.data}
                                margin={{ top: 10, right: 10, left: 0, bottom: 32 }}
                                barCategoryGap="8%"
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} opacity={isDark ? 0.4 : 0.5} />
                                <XAxis
                                    dataKey="hourLabel"
                                    angle={-45}
                                    textAnchor="end"
                                    height={48}
                                    tick={{ fontSize: 10, fill: chartTickFill }}
                                    interval={0}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: chartTickFill }}
                                    domain={[0, 100]}
                                    tickFormatter={(v) => `${v}%`}
                                    width={32}
                                />
                                <Bar
                                    dataKey="percent"
                                    fill={COLORS[0]}
                                    radius={[2, 2, 0, 0]}
                                    name="% hora"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                            No hay datos en este día
                        </div>
                    )
                ) : !result?.data?.length ? (
                    <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                        No hay datos en este período
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart
                            data={result.data}
                            margin={{ top: 10, right: 10, left: 0, bottom: 56 }}
                            barCategoryGap="12%"
                            barGap={2}
                            onClick={(state: any) => {
                                if (state?.activePayload?.[0]?.payload && isClickable) {
                                    handleBarClick(state.activePayload[0].payload);
                                }
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} opacity={isDark ? 0.4 : 0.5} />
                            <XAxis
                                dataKey="period"
                                angle={period === "day" || drillLevel === "day" ? -25 : -35}
                                textAnchor="end"
                                height={48}
                                tick={{ fontSize: 10, fill: chartTickFill }}
                                interval={0}
                                tickFormatter={(value) => {
                                    if ((period !== "day" && drillLevel !== "day") || !result?.dateRange?.end)
                                        return value;
                                    const parts = result.dateRange.end.split("/");
                                    if (parts.length !== 3) return value;
                                    const [d, m] = String(value).split("/");
                                    if (!d || !m) return value;
                                    const year = parseInt(parts[2], 10);
                                    const date = new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
                                    if (Number.isNaN(date.getTime())) return value;
                                    return format(date, "EEE d", { locale: es });
                                }}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: chartTickFill }}
                                domain={[0, Math.ceil(maxHours * 1.1) || 8]}
                                allowDecimals={false}
                                width={28}
                            />
                            {projectKeys.map((key, i) => (
                                <Bar
                                    key={key}
                                    dataKey={key}
                                    stackId="hours"
                                    fill={COLORS[i % COLORS.length]}
                                    radius={[0, 0, 0, 0]}
                                    style={{ cursor: isClickable ? "pointer" : "default" }}
                                    onClick={(data: any) => {
                                        const payload = data?.payload ?? data;
                                        if (payload && isClickable) handleBarClick(payload);
                                    }}
                                >
                                    {result.data.map((_, idx) => (
                                        <Cell key={idx} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Bar>
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}

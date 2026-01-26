"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  subDays,
  subWeeks,
  subMonths,
  addDays,
  addWeeks,
  addMonths,
  parse,
  isSameMonth,
  isSameWeek,
} from "date-fns";
import { Loader2, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

type TimePeriod = "day" | "week" | "month";

interface ChartDataPoint {
  period: string;
  [key: string]: string | number; // Dynamic keys for each client/project
  total: number;
}

interface TimeEntryWithRelations {
  id: string;
  start_time: string;
  duration_minutes: number | null;
  tasks: {
    name: string;
    projects: {
      name: string;
      clients: {
        id: string;
        name: string;
      };
    };
  };
}

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
];

export function HoursChart() {
  const [period, setPeriod] = useState<TimePeriod>("week");
  const [periodOffset, setPeriodOffset] = useState(0); // 0 = período actual, -1 = anterior, etc.
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Map<string, string>>(new Map());
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [hoveredInfo, setHoveredInfo] = useState<{
    period: string;
    clientProject: string;
    hours: number;
  } | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadData();
  }, [period, periodOffset]);

  const loadData = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Calcular rango de fechas según el período y offset
      const now = new Date();
      let startDate: Date;
      let endDate: Date;
      let periodCount: number;

      switch (period) {
        case "day": {
          periodCount = 7; // Mostrar 7 días (una semana completa)
          const weekOptions = { weekStartsOn: 1 as const }; // Lunes = 1
          
          // Calcular el lunes de la semana actual o del período seleccionado
          let targetMonday: Date;
          if (periodOffset === 0) {
            // Semana actual: encontrar el lunes de esta semana
            targetMonday = startOfWeek(now, weekOptions);
          } else {
            // Períodos anteriores: retroceder semanas completas
            const weeksToGoBack = Math.abs(periodOffset);
            targetMonday = startOfWeek(subWeeks(now, weeksToGoBack), weekOptions);
          }
          
          // El rango va desde el lunes hasta el domingo (7 días)
          startDate = startOfDay(targetMonday);
          endDate = endOfDay(subDays(targetMonday, -6)); // 6 días después del lunes = domingo
          break;
        }
        case "week": {
          periodCount = 8; // Mostrar 8 semanas
          const weekOptions = { weekStartsOn: 1 as const }; // Lunes = 1
          const baseEnd = periodOffset === 0
            ? endOfWeek(now, weekOptions)
            : endOfWeek(subWeeks(now, Math.abs(periodOffset) * periodCount), weekOptions);
          endDate = baseEnd;
          startDate = startOfWeek(subWeeks(baseEnd, periodCount - 1), weekOptions);
          break;
        }
        case "month": {
          periodCount = 6; // Mostrar 6 meses
          const baseEnd = periodOffset === 0
            ? endOfMonth(now)
            : endOfMonth(subMonths(now, Math.abs(periodOffset) * periodCount));
          endDate = baseEnd;
          startDate = startOfMonth(subMonths(baseEnd, periodCount - 1));
          break;
        }
      }

      // Guardar rango de fechas para mostrar
      setDateRange({
        start: format(startDate, "dd/MM/yyyy"),
        end: format(endDate, "dd/MM/yyyy"),
      });

      // Obtener entradas de tiempo con relaciones
      const { data: entries, error } = await supabase
        .from("time_entries")
        .select("*, tasks(name, projects(name, clients(id, name)))")
        .eq("user_id", user.id)
        .gte("start_time", startDate.toISOString())
        .lte("start_time", endDate.toISOString())
        .order("start_time", { ascending: true });

      if (error) throw error;

      // Procesar datos
      const processedData = processEntries(
        entries as TimeEntryWithRelations[],
        period,
        startDate,
        endDate
      );
      setChartData(processedData.data);
      setClients(processedData.clients);
    } catch (error) {
      console.error("Error loading chart data:", error);
    } finally {
      setLoading(false);
    }
  };

  const processEntries = (
    entries: TimeEntryWithRelations[],
    periodType: TimePeriod,
    startDate: Date,
    endDate: Date
  ): { data: ChartDataPoint[]; clients: Map<string, string> } => {
    const clientMap = new Map<string, string>();
    const dataMap = new Map<string, Map<string, number>>(); // period -> client -> hours

    entries.forEach((entry) => {
      if (!entry.duration_minutes) return;

      const clientId = entry.tasks?.projects?.clients?.id;
      const clientName = entry.tasks?.projects?.clients?.name || "Sin cliente";
      const projectName = entry.tasks?.projects?.name || "Sin proyecto";
      const key = `${clientName} - ${projectName}`;

      if (!clientMap.has(key)) {
        clientMap.set(key, key);
      }

      const entryDate = new Date(entry.start_time);
      let periodKey: string;

      switch (periodType) {
        case "day":
          periodKey = format(entryDate, "dd/MM");
          break;
        case "week":
          periodKey = `Sem ${format(startOfWeek(entryDate, { weekStartsOn: 1 }), "dd/MM")}`;
          break;
        case "month":
          periodKey = format(entryDate, "MMM yyyy");
          break;
      }

      if (!dataMap.has(periodKey)) {
        dataMap.set(periodKey, new Map());
      }

      const periodData = dataMap.get(periodKey)!;
      const hours = (entry.duration_minutes || 0) / 60;
      periodData.set(key, (periodData.get(key) || 0) + hours);
    });

    // Generar todos los períodos en el rango
    let allPeriods: string[] = [];

    switch (periodType) {
      case "day": {
        const days = eachDayOfInterval({
          start: startOfDay(startDate),
          end: endOfDay(endDate),
        });
        allPeriods = days.map((d) => format(d, "dd/MM"));
        break;
      }
      case "week": {
        const weekOptions = { weekStartsOn: 1 as const }; // Lunes = 1
        const weeks = eachWeekOfInterval(
          {
            start: startOfWeek(startDate, weekOptions),
            end: endOfWeek(endDate, weekOptions),
          },
          weekOptions
        );
        allPeriods = weeks.map((w) => `Sem ${format(w, "dd/MM")}`);
        break;
      }
      case "month": {
        const months = eachMonthOfInterval({
          start: startOfMonth(startDate),
          end: endOfMonth(endDate),
        });
        allPeriods = months.map((m) => format(m, "MMM yyyy"));
        break;
      }
    }

    // Construir datos del gráfico
    const chartData: ChartDataPoint[] = allPeriods.map((periodKey) => {
      const periodData = dataMap.get(periodKey) || new Map();
      const dataPoint: ChartDataPoint = {
        period: periodKey,
        total: 0,
      };

      clientMap.forEach((clientKey) => {
        const hours = periodData.get(clientKey) || 0;
        dataPoint[clientKey] = Math.round(hours * 100) / 100;
        dataPoint.total += hours;
      });

      return dataPoint;
    });

    return { data: chartData, clients: clientMap };
  };

  const clientKeys = Array.from(clients.keys());
  const maxHours = Math.max(...chartData.map((d) => d.total), 0);

  const handlePreviousPeriod = () => {
    setPeriodOffset((prev) => prev - 1);
  };

  const handleNextPeriod = () => {
    setPeriodOffset((prev) => Math.min(0, prev + 1)); // No permitir ir al futuro
  };

  const handleResetToCurrent = () => {
    setPeriodOffset(0);
  };

  const handlePeriodChange = (newPeriod: TimePeriod) => {
    setPeriod(newPeriod);
    setPeriodOffset(0); // Resetear al período actual al cambiar tipo
  };

  const handleBarClick = (data: any, index: number) => {
    if (!data || !data.period) return;

    const clickedPeriod = data.period;
    const now = new Date();
    const weekOptions = { weekStartsOn: 1 as const };

    if (period === "month") {
      // Click en un mes → cambiar a vista de semanas de ese mes
      try {
        // Parsear el mes (formato: "MMM yyyy" como "Jan 2026")
        // El año ya está incluido en el formato
        const monthDate = parse(clickedPeriod, "MMM yyyy", new Date());
        
        // Calcular el lunes de la primera semana de ese mes
        const monthStart = startOfMonth(monthDate);
        const monthStartWeek = startOfWeek(monthStart, weekOptions);
        
        // Calcular el lunes de la semana actual
        const nowWeekStart = startOfWeek(now, weekOptions);
        
        // Calcular diferencia en semanas
        const weeksDiff = Math.floor(
          (nowWeekStart.getTime() - monthStartWeek.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );
        
        // Cambiar a modo semana con el offset calculado
        // Mostrar 8 semanas, así que ajustamos el offset para que el mes quede visible
        setPeriod("week");
        setPeriodOffset(-Math.floor(weeksDiff / 8)); // 8 semanas por vista
      } catch (error) {
        console.error("Error parsing month:", error);
      }
    } else if (period === "week") {
      // Click en una semana → cambiar a vista de días de esa semana
      try {
        // Parsear la semana (formato: "Sem dd/MM" como "Sem 01/01")
        const weekMatch = clickedPeriod.match(/Sem (\d{2}\/\d{2})/);
        if (!weekMatch) return;
        
        const weekDateStr = weekMatch[1];
        // Parsear con el año actual como referencia
        const weekDate = parse(weekDateStr, "dd/MM", new Date());
        
        // Ajustar el año: si el mes es mayor que el actual, probablemente es del año pasado
        if (weekDate.getMonth() > now.getMonth()) {
          weekDate.setFullYear(now.getFullYear() - 1);
        } else if (weekDate.getMonth() === now.getMonth() && weekDate.getDate() > now.getDate()) {
          // Si es el mismo mes pero el día es mayor, también es del año pasado
          weekDate.setFullYear(now.getFullYear() - 1);
        }
        
        // Calcular el lunes de esa semana
        const clickedWeekStart = startOfWeek(weekDate, weekOptions);
        const nowWeekStart = startOfWeek(now, weekOptions);
        
        // Calcular diferencia en semanas
        const weeksDiff = Math.floor(
          (nowWeekStart.getTime() - clickedWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );
        
        // Cambiar a modo día con el offset calculado
        setPeriod("day");
        setPeriodOffset(-weeksDiff); // Cada offset es una semana
      } catch (error) {
        console.error("Error parsing week:", error);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Horas Trabajadas
            </CardTitle>
            <CardDescription>
              Visualización de horas trabajadas por período con barras apiladas por cliente/proyecto
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={period === "day" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePeriodChange("day")}
                className="min-w-[60px]"
              >
                Día
              </Button>
              <Button
                variant={period === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePeriodChange("week")}
                className="min-w-[60px]"
              >
                Semana
              </Button>
              <Button
                variant={period === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePeriodChange("month")}
                className="min-w-[60px]"
              >
                Mes
              </Button>
            </div>
            {dateRange.start && dateRange.end && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-xs font-medium">
                <Calendar className="h-3 w-3" />
                <span>{dateRange.start} - {dateRange.end}</span>
              </div>
            )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPeriod}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToCurrent}
                disabled={periodOffset === 0}
                className="flex items-center gap-1"
              >
                <Calendar className="h-4 w-4" />
                Actual
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPeriod}
                disabled={periodOffset === 0}
                className="flex items-center gap-1"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-96 text-muted-foreground">
            <p>No hay datos para mostrar en este período</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={450}>
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis
                dataKey="period"
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fontSize: 11 }}
                interval={0}
              />
              <YAxis
                label={{ value: "Horas", angle: -90, position: "insideLeft", style: { textAnchor: "middle" } }}
                tick={{ fontSize: 12 }}
                domain={[0, Math.ceil(maxHours * 1.1) || 8]}
                allowDecimals={false}
              />
              {clientKeys.map((clientKey, index) => (
                <Bar
                  key={clientKey}
                  dataKey={clientKey}
                  stackId="hours"
                  fill={COLORS[index % COLORS.length]}
                  radius={[0, 0, 0, 0]}
                  style={{ cursor: period !== "day" ? "pointer" : "default" }}
                  onMouseEnter={(data: any, index: number) => {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'hours-chart.tsx:496',message:'onMouseEnter called',data:{hasData:!!data,hasPayload:!!(data?.payload),clientKey,index},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    // En Recharts, el evento puede venir en diferentes formatos
                    let payload = data;
                    if (data && data.payload) {
                      payload = data.payload;
                    }
                    
                    if (payload) {
                      const hours = payload[clientKey] as number;
                      if (hours && hours > 0) {
                        setHoveredInfo({
                          period: payload.period as string,
                          clientProject: clientKey,
                          hours: hours,
                        });
                      }
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredInfo(null);
                  }}
                  onClick={(data: any, index: number) => {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'hours-chart.tsx:520',message:'Bar onClick called',data:{hasData:!!data,hasPayload:!!(data?.payload),clientKey,index,period},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    // Manejar click en la barra individual
                    let payload = data;
                    if (data && data.payload) {
                      payload = data.payload;
                    }
                    
                    if (payload && payload.period) {
                      handleBarClick(payload, index);
                    }
                  }}
                >
                  {chartData.map((entry, entryIndex) => (
                    <Cell
                      key={`cell-${entryIndex}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
        {!loading && chartData.length > 0 && (
          <div className="mt-4 space-y-3">
            {/* Cuadro de información al hacer hover - altura fija */}
            <div className="h-20 px-4 py-3 bg-muted rounded-lg border flex items-center">
              {hoveredInfo ? (
                <div className="flex flex-col gap-2 text-sm w-full">
                  <div className="font-semibold text-base">{hoveredInfo.period}</div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded flex-shrink-0"
                      style={{
                        backgroundColor: COLORS[
                          clientKeys.indexOf(hoveredInfo.clientProject) % COLORS.length
                        ],
                      }}
                    />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{hoveredInfo.clientProject}</div>
                      <div className="text-muted-foreground">
                        {hoveredInfo.hours.toFixed(2)} horas
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center w-full">
                  Pasa el mouse sobre una barra para ver los detalles
                </div>
              )}
            </div>
            {/* Total del período */}
            <div className="pt-2 border-t">
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="font-medium">Total del período:</div>
                <div className="text-muted-foreground">
                  {chartData.reduce((sum, d) => sum + d.total, 0).toFixed(2)} horas
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

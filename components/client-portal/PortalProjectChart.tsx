"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { cn } from "@/lib/utils";
import { FolderKanban } from "lucide-react";
import { getPortalProjectDistribution } from "@/lib/actions/portal";
import { Loader2 } from "lucide-react";

const COLORS = ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe"];

export interface PortalProjectChartProps {
    /**
     * Rango de fechas sincronizado con el drill-down de la gráfica de barras.
     * Si es null, se muestra la distribución global (todas las horas).
     */
    dateRange: { start: Date; end: Date } | null;
    className?: string;
}

export function PortalProjectChart({ dateRange, className }: PortalProjectChartProps) {
    const [data, setData] = useState<{ name: string; value: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const legendColor = isDark ? "hsl(215,15%,75%)" : undefined;

    const startTime = dateRange?.start?.getTime?.();
    const endTime = dateRange?.end?.getTime?.();
    const hasValidRange =
        typeof startTime === "number" &&
        typeof endTime === "number" &&
        !Number.isNaN(startTime) &&
        !Number.isNaN(endTime);

    useEffect(() => {
        setLoading(true);
        if (hasValidRange && dateRange) {
            const start = dateRange.start.getTime();
            const end = dateRange.end.getTime();
            if (!Number.isNaN(start) && !Number.isNaN(end)) {
                getPortalProjectDistribution({
                    rangeStart: dateRange.start.toISOString(),
                    rangeEnd: dateRange.end.toISOString(),
                })
                    .then(setData)
                    .finally(() => setLoading(false));
                return;
            }
        }
        getPortalProjectDistribution()
            .then(setData)
            .finally(() => setLoading(false));
    }, [hasValidRange, startTime, endTime]);

    return (
        <Card className={cn("border border-border bg-card shadow-sm flex flex-col min-h-[420px] h-full", className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    Horas por proyecto
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {dateRange
                        ? "Distribución en el período seleccionado"
                        : "Distribución de horas netas (total)"}
                </p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : !data.length ? (
                    <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                        Sin datos en este período
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={90}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                labelLine={false}
                            >
                                {data.map((_, index) => (
                                    <Cell
                                        key={index}
                                        fill={COLORS[index % COLORS.length]}
                                        stroke="transparent"
                                    />
                                ))}
                            </Pie>
                            <Legend layout="horizontal" align="center" wrapperStyle={{ fontSize: 11, ...(legendColor ? { color: legendColor } : {}) }} />
                        </PieChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}

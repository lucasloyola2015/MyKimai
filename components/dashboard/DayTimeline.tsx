"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay, differenceInMinutes, isSameDay } from "date-fns";

interface Break {
    start_time: Date;
    end_time: Date | null;
}

interface DayTimelineProps {
    startTime: Date;
    endTime: Date | null;
    breaks?: Break[];
    className?: string;
    /** Variante compacta: barra más baja y sin etiquetas 00h/24h (para tablas o listas). */
    compact?: boolean;
}

export function DayTimeline({ startTime, endTime, breaks = [], className, compact = false }: DayTimelineProps) {
    const dayStart = startOfDay(startTime);
    const dayEnd = endOfDay(startTime);
    const TOTAL_MINUTES = 1440;

    // Si no hay end_time y es el mismo día, usamos la hora actual (truncada al final del día)
    // Si no hay end_time y es un día pasado, usamos el final de ese día
    const effectiveEndTime = endTime
        ? (endTime > dayEnd ? dayEnd : endTime)
        : (isSameDay(new Date(), startTime) ? new Date() : dayEnd);

    const getPercentage = (date: Date) => {
        const mins = differenceInMinutes(date, dayStart);
        return Math.max(0, Math.min(100, (mins / TOTAL_MINUTES) * 100));
    };

    const segments: { type: "work" | "break"; start: number; width: number }[] = [];

    // Ordenar pausas por inicio
    const sortedBreaks = [...breaks]
        .filter(b => b.start_time >= dayStart && b.start_time <= dayEnd)
        .sort((a, b) => a.start_time.getTime() - b.start_time.getTime());

    let currentPos = startTime;

    sortedBreaks.forEach((brk) => {
        // Si la pausa empieza después de nuestra posición actual, hay un tramo de trabajo
        if (brk.start_time > currentPos) {
            const startPct = getPercentage(currentPos);
            const endPct = getPercentage(brk.start_time);
            segments.push({
                type: "work",
                start: startPct,
                width: endPct - startPct,
            });
        }

        // Tramo de pausa
        const breakEnd = brk.end_time || (isSameDay(new Date(), brk.start_time) ? new Date() : dayEnd);
        const breakStartPct = getPercentage(brk.start_time);
        const breakEndPct = getPercentage(breakEnd > dayEnd ? dayEnd : breakEnd);

        if (breakEndPct > breakStartPct) {
            segments.push({
                type: "break",
                start: breakStartPct,
                width: breakEndPct - breakStartPct,
            });
        }

        currentPos = breakEnd > dayEnd ? dayEnd : breakEnd;
    });

    // Tramo final de trabajo si queda tiempo hasta effectiveEndTime
    if (effectiveEndTime > currentPos) {
        const startPct = getPercentage(currentPos);
        const endPct = getPercentage(effectiveEndTime);
        segments.push({
            type: "work",
            start: startPct,
            width: endPct - startPct,
        });
    }

    return (
        <div className={cn(compact ? "mt-1 space-y-0.5" : "mt-4 space-y-1.5", className)}>
            <div className={cn(
                "relative w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200",
                compact ? "h-1.5" : "h-2"
            )}>
                {segments.map((seg, idx) => (
                    <div
                        key={idx}
                        className={cn(
                            "absolute top-0 h-full transition-all duration-500",
                            seg.type === "work" ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-orange-400"
                        )}
                        style={{
                            left: `${seg.start}%`,
                            width: `${seg.width}%`,
                        }}
                    />
                ))}
            </div>

            {/* Ticks/Labels (ocultos en compacto) */}
            {!compact && (
                <div className="flex justify-between px-0.5 text-[10px] font-medium text-slate-400">
                    <span>00h</span>
                    <span>06h</span>
                    <span>12h</span>
                    <span>18h</span>
                    <span>24h</span>
                </div>
            )}
        </div>
    );
}

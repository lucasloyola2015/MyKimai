"use client";

import { useEffect, useState } from "react";
import { Flag, CheckCircle2, Clock } from "lucide-react";
import { CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    getPortalProjectMilestones,
    type MilestoneView,
} from "@/lib/actions/milestones";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<MilestoneView["status"], string> = {
    planned: "Planificado",
    in_progress: "En progreso",
    completed: "Completado",
    blocked: "Bloqueado",
    cancelled: "Cancelado",
};

const STATUS_CLASSES: Record<MilestoneView["status"], string> = {
    planned: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30",
    in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30",
    completed: "bg-green-500/10 text-green-600 dark:text-green-300 border-green-500/30",
    blocked: "bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/30",
    cancelled: "bg-gray-500/10 text-gray-600 dark:text-gray-300 border-gray-500/30",
};

interface Props {
    projectId: string;
}

export function MilestonesPanel({ projectId }: Props) {
    const [milestones, setMilestones] = useState<MilestoneView[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const data = await getPortalProjectMilestones(projectId);
            if (!cancelled) setMilestones(data);
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    if (milestones === null) {
        return <Skeleton className="h-32 w-full" />;
    }

    // Si no hay hitos visibles, no renderizar nada (no ensuciar el portal)
    if (milestones.length === 0) {
        return null;
    }

    const completed = milestones.filter((m) => m.status === "completed").length;
    const totalBudgetHours = milestones.reduce(
        (sum, m) => sum + (m.budget_hours ?? 0),
        0
    );
    const totalCurrentHours = milestones.reduce(
        (sum, m) =>
            sum +
            (m.status === "completed" && m.actual_hours != null
                ? m.actual_hours
                : m.current_hours),
        0
    );
    const globalPct =
        totalBudgetHours > 0
            ? Math.min(100, (totalCurrentHours / totalBudgetHours) * 100)
            : null;

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Flag className="h-5 w-5 text-muted-foreground" />
                    Avance por hitos
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                    <span className="font-mono font-bold text-foreground">
                        {completed}
                    </span>
                    /{milestones.length} completados
                    {globalPct != null && (
                        <>
                            {" · "}
                            <span className="font-mono font-bold text-foreground">
                                {totalCurrentHours.toFixed(1)}h
                            </span>{" "}
                            / {totalBudgetHours.toFixed(1)}h presupuestadas
                        </>
                    )}
                </div>
            </div>

            {globalPct != null && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${globalPct}%` }}
                    />
                </div>
            )}

            <div className="space-y-3">
                {milestones.map((m) => {
                    const totalHours =
                        m.status === "completed" && m.actual_hours != null
                            ? m.actual_hours
                            : m.current_hours;
                    const progressPct =
                        m.budget_hours && m.budget_hours > 0
                            ? Math.min(100, (totalHours / m.budget_hours) * 100)
                            : null;
                    return (
                        <div
                            key={m.id}
                            className="rounded-lg border bg-card p-4 space-y-2"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {m.status === "completed" && (
                                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                        )}
                                        <span className="font-bold">{m.name}</span>
                                        <span
                                            className={cn(
                                                "text-xs px-2 py-0.5 rounded-full border font-medium",
                                                STATUS_CLASSES[m.status]
                                            )}
                                        >
                                            {STATUS_LABEL[m.status]}
                                        </span>
                                    </div>
                                    {m.description && (
                                        <p className="text-sm text-muted-foreground line-clamp-2">
                                            {m.description}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
                                        {m.target_date && (
                                            <span>
                                                Target:{" "}
                                                <span className="font-mono text-foreground">
                                                    {format(
                                                        new Date(m.target_date),
                                                        "dd MMM yyyy",
                                                        { locale: es }
                                                    )}
                                                </span>
                                            </span>
                                        )}
                                        {m.completed_at && (
                                            <span>
                                                Completado:{" "}
                                                <span className="font-mono text-foreground">
                                                    {format(
                                                        new Date(m.completed_at),
                                                        "dd MMM yyyy",
                                                        { locale: es }
                                                    )}
                                                </span>
                                            </span>
                                        )}
                                        <span className="font-mono inline-flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {totalHours.toFixed(1)}h
                                            {m.budget_hours != null && (
                                                <> / {m.budget_hours.toFixed(1)}h</>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {progressPct != null && (
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                    <div
                                        className={cn(
                                            "h-full transition-all",
                                            m.status === "completed"
                                                ? "bg-green-500"
                                                : "bg-primary"
                                        )}
                                        style={{ width: `${progressPct}%` }}
                                    />
                                </div>
                            )}
                            {m.completion_notes && (
                                <p className="text-xs italic text-muted-foreground">
                                    {m.completion_notes}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

"use client";

import { useState, useTransition } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import {
    createMilestone,
    updateMilestone,
    deleteMilestone,
    type MilestoneView,
} from "@/lib/actions/milestones";
import { Plus, Pencil, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";

const STATUS_OPTIONS: {
    value: MilestoneView["status"];
    label: string;
    color: string;
}[] = [
    { value: "planned", label: "Planificado", color: "bg-slate-500/10 text-slate-600" },
    { value: "in_progress", label: "En progreso", color: "bg-blue-500/10 text-blue-600" },
    { value: "completed", label: "Completado", color: "bg-green-500/10 text-green-600" },
    { value: "blocked", label: "Bloqueado", color: "bg-red-500/10 text-red-600" },
    { value: "cancelled", label: "Cancelado", color: "bg-gray-500/10 text-gray-600" },
];

interface Props {
    projectId: string;
    projectCurrency: string;
    initialMilestones: MilestoneView[];
}

interface FormState {
    name: string;
    description: string;
    target_date: string;
    status: MilestoneView["status"];
    budget_hours: string;
    budget_amount: string;
    budget_currency: string;
    visible_to_client: boolean;
}

function emptyForm(currency: string): FormState {
    return {
        name: "",
        description: "",
        target_date: "",
        status: "planned",
        budget_hours: "",
        budget_amount: "",
        budget_currency: currency,
        visible_to_client: true,
    };
}

export function MilestonesManager({
    projectId,
    projectCurrency,
    initialMilestones,
}: Props) {
    const router = useRouter();
    const { toast } = useToast();
    const [milestones] = useState<MilestoneView[]>(initialMilestones);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm(projectCurrency));
    const [pending, startPending] = useTransition();

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm(projectCurrency));
        setDialogOpen(true);
    };

    const openEdit = (m: MilestoneView) => {
        setEditingId(m.id);
        setForm({
            name: m.name,
            description: m.description ?? "",
            target_date: m.target_date
                ? m.target_date.slice(0, 10)
                : "",
            status: m.status,
            budget_hours:
                m.budget_hours != null ? String(m.budget_hours) : "",
            budget_amount:
                m.budget_amount != null ? String(m.budget_amount) : "",
            budget_currency: m.budget_currency ?? projectCurrency,
            visible_to_client: m.visible_to_client,
        });
        setDialogOpen(true);
    };

    const handleSubmit = () => {
        startPending(async () => {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                target_date: form.target_date ? new Date(form.target_date) : null,
                status: form.status,
                budget_hours: form.budget_hours
                    ? Number(form.budget_hours)
                    : null,
                budget_amount: form.budget_amount
                    ? Number(form.budget_amount)
                    : null,
                budget_currency: form.budget_currency || null,
                visible_to_client: form.visible_to_client,
            };

            const res = editingId
                ? await updateMilestone({ id: editingId, ...payload })
                : await createMilestone({ project_id: projectId, ...payload });

            if (!res.success) {
                toast({
                    title: "Error",
                    description: res.error,
                    variant: "destructive",
                });
                return;
            }
            toast({
                title: editingId ? "Hito actualizado" : "Hito creado",
            });
            setDialogOpen(false);
            router.refresh();
        });
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar este hito? Los time entries vinculados quedan sin asociación.")) {
            return;
        }
        const res = await deleteMilestone(id);
        if (!res.success) {
            toast({
                title: "Error",
                description: res.error,
                variant: "destructive",
            });
            return;
        }
        toast({ title: "Hito eliminado" });
        router.refresh();
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                    <CardTitle>Hitos del proyecto</CardTitle>
                    <CardDescription>
                        Los hitos marcados como visibles aparecen en el portal
                        del cliente con su avance en horas vs el presupuesto.
                        Al marcar un hito como Completado, se snapshotean las
                        horas y monto actuales (para que un recálculo
                        posterior no altere el cierre).
                    </CardDescription>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nuevo hito
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>
                                {editingId ? "Editar hito" : "Nuevo hito"}
                            </DialogTitle>
                            <DialogDescription>
                                Definí el alcance, fecha objetivo y horas
                                presupuestadas. El progreso se calcula en vivo
                                a partir de los time entries vinculados.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label>Nombre</Label>
                                <Input
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            name: e.target.value,
                                        }))
                                    }
                                    placeholder="F1 — Relevamiento profundo"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Descripción</Label>
                                <Textarea
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            description: e.target.value,
                                        }))
                                    }
                                    rows={3}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label>Fecha objetivo</Label>
                                    <Input
                                        type="date"
                                        value={form.target_date}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                target_date: e.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Estado</Label>
                                    <Select
                                        value={form.status}
                                        onValueChange={(v) =>
                                            setForm((f) => ({
                                                ...f,
                                                status: v as MilestoneView["status"],
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUS_OPTIONS.map((opt) => (
                                                <SelectItem
                                                    key={opt.value}
                                                    value={opt.value}
                                                >
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label>Horas budget</Label>
                                    <Input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        value={form.budget_hours}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                budget_hours: e.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Monto budget</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={form.budget_amount}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                budget_amount: e.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Moneda</Label>
                                    <Select
                                        value={form.budget_currency}
                                        onValueChange={(v) =>
                                            setForm((f) => ({
                                                ...f,
                                                budget_currency: v,
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="USD">USD</SelectItem>
                                            <SelectItem value="ARS">ARS</SelectItem>
                                            <SelectItem value="EUR">EUR</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="visible"
                                    checked={form.visible_to_client}
                                    onCheckedChange={(c) =>
                                        setForm((f) => ({
                                            ...f,
                                            visible_to_client: c === true,
                                        }))
                                    }
                                />
                                <Label htmlFor="visible" className="text-sm">
                                    Visible en el portal del cliente
                                </Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setDialogOpen(false)}
                                disabled={pending}
                            >
                                Cancelar
                            </Button>
                            <Button onClick={handleSubmit} disabled={pending}>
                                {pending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {editingId ? "Guardar" : "Crear"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {milestones.length === 0 ? (
                    <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Aún no creaste hitos para este proyecto.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {milestones.map((m) => {
                            const statusOpt =
                                STATUS_OPTIONS.find((s) => s.value === m.status) ??
                                STATUS_OPTIONS[0];
                            const totalHours =
                                m.status === "completed" && m.actual_hours != null
                                    ? m.actual_hours
                                    : m.current_hours;
                            const progressPct =
                                m.budget_hours && m.budget_hours > 0
                                    ? Math.min(
                                          100,
                                          (totalHours / m.budget_hours) * 100
                                      )
                                    : null;
                            return (
                                <div
                                    key={m.id}
                                    className="rounded-md border p-4"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex-1 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-medium">
                                                    {m.name}
                                                </span>
                                                <Badge className={statusOpt.color}>
                                                    {statusOpt.label}
                                                </Badge>
                                                {!m.visible_to_client && (
                                                    <Badge variant="outline">
                                                        <EyeOff className="mr-1 h-3 w-3" />
                                                        Interno
                                                    </Badge>
                                                )}
                                            </div>
                                            {m.description && (
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {m.description}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
                                                {m.target_date && (
                                                    <span>
                                                        Target:{" "}
                                                        <span className="font-mono">
                                                            {format(
                                                                new Date(m.target_date),
                                                                "dd/MM/yyyy"
                                                            )}
                                                        </span>
                                                    </span>
                                                )}
                                                <span className="font-mono">
                                                    {totalHours.toFixed(1)}h
                                                    {m.budget_hours != null && (
                                                        <> / {m.budget_hours.toFixed(1)}h</>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex space-x-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEdit(m)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(m.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    {progressPct != null && (
                                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                                            <div
                                                className="h-full bg-primary transition-all"
                                                style={{ width: `${progressPct}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

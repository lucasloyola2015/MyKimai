"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { arDayKey } from "@/lib/timezone";
import type { ExpenseFilters as Filters } from "@/lib/validations/expenses";

export const STATUS_OPTIONS: { value: NonNullable<Filters["status"]>; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "pending", label: "Pendiente de facturar" },
    { value: "invoiced", label: "Facturado, sin cobrar" },
    { value: "paid", label: "Cobrado" },
    { value: "billed", label: "Facturado (cobrado o no)" },
    { value: "not_billable", label: "No facturable" },
];

interface Props {
    clients: { id: string; name: string }[];
    filters: Filters;
}

/** Rangos rápidos en hora AR (YYYY-MM-DD). */
function presets(): { label: string; from: string; to: string }[] {
    const today = arDayKey(new Date());
    const [y, m] = today.split("-").map(Number);
    const pad = (n: number) => String(n).padStart(2, "0");
    const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    return [
        { label: "Este mes", from: `${y}-${pad(m)}-01`, to: today },
        { label: "Mes pasado", from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` },
        { label: "Este año", from: `${y}-01-01`, to: today },
    ];
}

export function ExpenseFilters({ clients, filters }: Props) {
    const router = useRouter();

    const apply = (patch: Partial<Filters>) => {
        const next = { ...filters, ...patch };
        const params = new URLSearchParams();
        if (next.client_id) params.set("client", next.client_id);
        if (next.from) params.set("from", next.from);
        if (next.to) params.set("to", next.to);
        if (next.status && next.status !== "all") params.set("status", next.status);
        const qs = params.toString();
        router.push(qs ? `/dashboard/expenses?${qs}` : "/dashboard/expenses");
    };

    const active = Boolean(filters.client_id || filters.from || filters.to || (filters.status && filters.status !== "all"));

    return (
        <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                    <Label>Cliente</Label>
                    <Select
                        value={filters.client_id ?? "all"}
                        onValueChange={(v) => apply({ client_id: v === "all" ? undefined : v })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los clientes</SelectItem>
                            {clients.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label>Estado</Label>
                    <Select
                        value={filters.status ?? "all"}
                        onValueChange={(v) => apply({ status: v as Filters["status"] })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="expenses-from">Desde</Label>
                    <Input
                        id="expenses-from"
                        type="date"
                        value={filters.from ?? ""}
                        onChange={(e) => apply({ from: e.target.value || undefined })}
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="expenses-to">Hasta</Label>
                    <Input
                        id="expenses-to"
                        type="date"
                        value={filters.to ?? ""}
                        onChange={(e) => apply({ to: e.target.value || undefined })}
                    />
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {presets().map((p) => (
                    <Button
                        key={p.label}
                        variant={filters.from === p.from && filters.to === p.to ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => apply({ from: p.from, to: p.to })}
                    >
                        {p.label}
                    </Button>
                ))}
                <Button
                    variant={!filters.from && !filters.to ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => apply({ from: undefined, to: undefined })}
                >
                    Todo
                </Button>
                {active && (
                    <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/expenses")}>
                        <X className="mr-1 h-4 w-4" />
                        Limpiar filtros
                    </Button>
                )}
            </div>
        </div>
    );
}

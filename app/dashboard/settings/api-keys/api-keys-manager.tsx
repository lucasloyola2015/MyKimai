"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Check, Copy, KeyRound, Loader2, Plus, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime24 } from "@/lib/date-format";
import { createApiKey, revokeApiKey, type ApiKeyView } from "@/lib/actions/api-keys";

interface Props {
    keys: ApiKeyView[];
    canRequestFinancials: boolean;
}

const SCOPE_LABELS: Record<string, string> = {
    read: "Consultar",
    write: "Cargar horas",
    financials: "Finanzas",
};

const EXPIRY_OPTIONS = [
    { value: "90", label: "90 días" },
    { value: "365", label: "1 año" },
    { value: "never", label: "Sin vencimiento" },
];

function keyStatus(k: ApiKeyView): { label: string; variant: "active" | "cancelled" | "paused" } {
    if (k.revoked_at) return { label: "Revocada", variant: "cancelled" };
    if (k.expires_at && new Date(k.expires_at) <= new Date()) return { label: "Vencida", variant: "paused" };
    return { label: "Activa", variant: "active" };
}

export function ApiKeysManager({ keys, canRequestFinancials }: Props) {
    const router = useRouter();
    const { toast } = useToast();
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, startCreating] = useTransition();
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const emptyForm = { name: "", write: true, financials: false, expiry: "365" };
    const [form, setForm] = useState(emptyForm);

    const handleCreate = () => {
        startCreating(async () => {
            const scopes: ("read" | "write" | "financials")[] = ["read"];
            if (form.write) scopes.push("write");
            if (form.financials) scopes.push("financials");

            const res = await createApiKey({
                name: form.name,
                scopes,
                expires_in_days: form.expiry === "never" ? null : Number(form.expiry),
            });
            if (!res.success) {
                toast({
                    title: "No se pudo crear la API key",
                    description: res.error,
                    variant: "destructive",
                });
                return;
            }
            setCreateOpen(false);
            setForm(emptyForm);
            setCopied(false);
            setNewKey(res.data.key);
            router.refresh();
        });
    };

    const handleCopy = async () => {
        if (!newKey) return;
        try {
            await navigator.clipboard.writeText(newKey);
            setCopied(true);
        } catch {
            toast({ title: "No se pudo copiar", description: "Copiala a mano.", variant: "destructive" });
        }
    };

    const handleRevoke = async (k: ApiKeyView) => {
        if (!confirm(`¿Revocar "${k.name}"? Los agentes que la usen dejan de tener acceso.`)) return;
        setRevokingId(k.id);
        const res = await revokeApiKey(k.id);
        setRevokingId(null);
        if (!res.success) {
            toast({ title: "Error al revocar", description: res.error, variant: "destructive" });
            return;
        }
        toast({ title: "API key revocada" });
        router.refresh();
    };

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <div>
                        <CardTitle>Tus API keys</CardTitle>
                        <CardDescription>
                            Cada key actúa como vos: ve el mismo workspace y respeta tu rol.
                            No pueden tocar horas ya facturadas ni definir montos.
                        </CardDescription>
                    </div>
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nueva API key
                    </Button>
                </CardHeader>
                <CardContent>
                    {keys.length === 0 ? (
                        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
                            Todavía no creaste ninguna API key.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                                        <th className="py-2 font-medium">Nombre</th>
                                        <th className="py-2 font-medium">Key</th>
                                        <th className="py-2 font-medium">Permisos</th>
                                        <th className="py-2 font-medium">Último uso</th>
                                        <th className="py-2 font-medium">Vence</th>
                                        <th className="py-2 font-medium">Estado</th>
                                        <th className="py-2 text-right font-medium">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {keys.map((k) => {
                                        const status = keyStatus(k);
                                        return (
                                            <tr key={k.id} className="border-b last:border-0">
                                                <td className="py-3 font-medium">{k.name}</td>
                                                <td className="py-3 font-mono text-xs">{k.key_prefix}…</td>
                                                <td className="py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {k.scopes.map((s) => (
                                                            <Badge key={s} variant="outline" size="sm">
                                                                {SCOPE_LABELS[s] ?? s}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="py-3 text-xs text-muted-foreground">
                                                    {k.last_used_at ? formatDateTime24(k.last_used_at) : "Nunca"}
                                                </td>
                                                <td className="py-3 text-xs text-muted-foreground">
                                                    {k.expires_at ? format(new Date(k.expires_at), "dd/MM/yyyy") : "—"}
                                                </td>
                                                <td className="py-3">
                                                    <Badge variant={status.variant} size="sm">
                                                        {status.label}
                                                    </Badge>
                                                </td>
                                                <td className="py-3 text-right">
                                                    {!k.revoked_at && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleRevoke(k)}
                                                            disabled={revokingId === k.id}
                                                            title="Revocar"
                                                        >
                                                            {revokingId === k.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Ban className="h-4 w-4 text-destructive" />
                                                            )}
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Crear */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nueva API key</DialogTitle>
                        <DialogDescription>
                            Usá una key por agente o máquina, así podés revocarlas por separado.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="key-name">Nombre</Label>
                            <Input
                                id="key-name"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Claude Code — notebook"
                                maxLength={100}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Permisos</Label>
                            <div className="flex items-start gap-2">
                                <Checkbox id="scope-read" checked disabled />
                                <Label htmlFor="scope-read" className="font-normal leading-tight">
                                    Consultar clientes, proyectos y horas
                                </Label>
                            </div>
                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="scope-write"
                                    checked={form.write}
                                    onCheckedChange={(v) => setForm((f) => ({ ...f, write: v === true }))}
                                />
                                <Label htmlFor="scope-write" className="font-normal leading-tight">
                                    Cargar y editar mis horas
                                </Label>
                            </div>
                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="scope-financials"
                                    checked={form.financials}
                                    disabled={!canRequestFinancials}
                                    onCheckedChange={(v) => setForm((f) => ({ ...f, financials: v === true }))}
                                />
                                <Label htmlFor="scope-financials" className="font-normal leading-tight">
                                    Ver datos financieros (tarifas, montos, facturas)
                                    {!canRequestFinancials && (
                                        <span className="block text-xs text-muted-foreground">
                                            Tu rol no tiene acceso a finanzas.
                                        </span>
                                    )}
                                </Label>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Vencimiento</Label>
                            <Select
                                value={form.expiry}
                                onValueChange={(v) => setForm((f) => ({ ...f, expiry: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EXPIRY_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                            Cancelar
                        </Button>
                        <Button onClick={handleCreate} disabled={creating || !form.name.trim()}>
                            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Crear
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Mostrar una sola vez */}
            <Dialog open={newKey !== null} onOpenChange={(open) => !open && setNewKey(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5" />
                            Copiá tu API key
                        </DialogTitle>
                        <DialogDescription>
                            Es la única vez que se muestra. Guardala en una variable de entorno
                            (por ejemplo <code className="font-mono">MYKIMAI_API_KEY</code>), nunca en un repo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2">
                        <Input readOnly value={newKey ?? ""} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                        <Button variant="outline" size="icon" onClick={handleCopy} title="Copiar">
                            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setNewKey(null)}>Listo, ya la guardé</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import {
    inviteTeamMember,
    removeTeamMember,
    updateTeamMember,
    type TeamMemberView,
} from "@/lib/actions/team-members";
import { UserPlus, Trash2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

interface Props {
    initialMembers: TeamMemberView[];
}

export function TeamMembersManager({ initialMembers }: Props) {
    const router = useRouter();
    const { toast } = useToast();
    const [members] = useState<TeamMemberView[]>(initialMembers);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviting, startInviting] = useTransition();
    const [removingId, setRemovingId] = useState<string | null>(null);

    const [form, setForm] = useState({
        email: "",
        password: "",
        role: "collaborator" as "collaborator" | "admin",
        default_rate: "",
        default_currency: "USD",
    });

    const handleInvite = () => {
        startInviting(async () => {
            const rate = form.default_rate.trim()
                ? Number(form.default_rate)
                : null;
            const res = await inviteTeamMember({
                email: form.email.trim(),
                password: form.password,
                role: form.role,
                default_rate: rate,
                default_currency: form.default_currency || null,
            });
            if (!res.success) {
                toast({
                    title: "No se pudo invitar al miembro",
                    description: res.error,
                    variant: "destructive",
                });
                return;
            }
            toast({
                title: "Miembro invitado",
                description: res.data.created
                    ? "Se creó el usuario y se vinculó al workspace."
                    : "El usuario ya existía y se vinculó al workspace.",
            });
            setInviteOpen(false);
            setForm({
                email: "",
                password: "",
                role: "collaborator",
                default_rate: "",
                default_currency: "USD",
            });
            router.refresh();
        });
    };

    const handleRemove = async (id: string) => {
        if (!confirm("¿Eliminar el acceso de este miembro al workspace?")) return;
        setRemovingId(id);
        const res = await removeTeamMember(id);
        setRemovingId(null);
        if (!res.success) {
            toast({
                title: "Error al eliminar",
                description: res.error,
                variant: "destructive",
            });
            return;
        }
        toast({ title: "Miembro eliminado" });
        router.refresh();
    };

    const handleRoleChange = async (
        id: string,
        role: "collaborator" | "admin"
    ) => {
        const res = await updateTeamMember({ id, role });
        if (!res.success) {
            toast({
                title: "Error al cambiar el rol",
                description: res.error,
                variant: "destructive",
            });
            return;
        }
        toast({ title: "Rol actualizado" });
        router.refresh();
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                    <CardTitle>Miembros activos</CardTitle>
                    <CardDescription>
                        Los colaboradores cargan horas en proyectos del workspace.
                        Los admins además ven facturas y pagos. Solo vos podés
                        emitir facturas o gestionar clientes/proyectos.
                    </CardDescription>
                </div>
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Invitar miembro
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Invitar miembro al workspace</DialogTitle>
                            <DialogDescription>
                                Se creará un usuario en Supabase Auth (si el email
                                no existe) y se vinculará al workspace con el rol
                                elegido. Compartile la contraseña por canal seguro.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <Label htmlFor="invite-email">Email</Label>
                                <Input
                                    id="invite-email"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, email: e.target.value }))
                                    }
                                    placeholder="lucio@example.com"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="invite-password">Contraseña inicial</Label>
                                <Input
                                    id="invite-password"
                                    type="password"
                                    value={form.password}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            password: e.target.value,
                                        }))
                                    }
                                    placeholder="Mínimo 8 caracteres"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Rol</Label>
                                <Select
                                    value={form.role}
                                    onValueChange={(v) =>
                                        setForm((f) => ({
                                            ...f,
                                            role: v as "collaborator" | "admin",
                                        }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="collaborator">
                                            Collaborator — carga horas
                                        </SelectItem>
                                        <SelectItem value="admin">
                                            Admin — collaborator + ve facturas
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label htmlFor="invite-rate">
                                        Tarifa interna (opcional)
                                    </Label>
                                    <Input
                                        id="invite-rate"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={form.default_rate}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                default_rate: e.target.value,
                                            }))
                                        }
                                        placeholder="35.00"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Moneda</Label>
                                    <Select
                                        value={form.default_currency}
                                        onValueChange={(v) =>
                                            setForm((f) => ({
                                                ...f,
                                                default_currency: v,
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="USD">USD</SelectItem>
                                            <SelectItem value="ARS">ARS</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                La tarifa interna es de referencia (cómo se reparte
                                la torta internamente). La tarifa que se cobra al
                                cliente sigue siendo la del cliente / proyecto /
                                tarea.
                            </p>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setInviteOpen(false)}
                                disabled={inviting}
                            >
                                Cancelar
                            </Button>
                            <Button onClick={handleInvite} disabled={inviting}>
                                {inviting && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Invitar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {members.length === 0 ? (
                    <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Todavía no invitaste a nadie. Apretá "Invitar miembro"
                        para empezar.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                                    <th className="py-2 font-medium">Email</th>
                                    <th className="py-2 font-medium">Rol</th>
                                    <th className="py-2 font-medium">Tarifa interna</th>
                                    <th className="py-2 font-medium">Invitado</th>
                                    <th className="py-2 text-right font-medium">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map((m) => (
                                    <tr key={m.id} className="border-b last:border-0">
                                        <td className="py-3 font-mono text-xs">
                                            {m.email ?? <span className="text-muted-foreground">(email no disponible)</span>}
                                        </td>
                                        <td className="py-3">
                                            <Select
                                                value={m.role}
                                                onValueChange={(v) =>
                                                    handleRoleChange(
                                                        m.id,
                                                        v as "collaborator" | "admin"
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="h-8 w-[160px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="collaborator">
                                                        Collaborator
                                                    </SelectItem>
                                                    <SelectItem value="admin">
                                                        Admin
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </td>
                                        <td className="py-3 font-mono">
                                            {m.default_rate != null
                                                ? `${m.default_currency ?? "USD"} ${m.default_rate.toFixed(2)}`
                                                : "—"}
                                        </td>
                                        <td className="py-3 text-xs text-muted-foreground">
                                            {format(new Date(m.invited_at), "dd/MM/yyyy")}
                                            {m.accepted_at && (
                                                <Badge
                                                    variant="secondary"
                                                    className="ml-2"
                                                >
                                                    Activo
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="py-3 text-right">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleRemove(m.id)}
                                                disabled={removingId === m.id}
                                            >
                                                {removingId === m.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                )}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

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
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
    grantProjectAccess,
    revokeProjectAccess,
    updateProjectAccess,
    updateClientUserVisibility,
    type StakeholderView,
} from "@/lib/actions/project-access";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Props {
    projectId: string;
    initialStakeholders: StakeholderView[];
}

export function StakeholdersManager({ projectId, initialStakeholders }: Props) {
    const router = useRouter();
    const { toast } = useToast();
    const [pendingId, setPendingId] = useState<string | null>(null);
    const stakeholders = initialStakeholders;

    const handleToggleAccess = async (s: StakeholderView, checked: boolean) => {
        setPendingId(s.client_user_id);
        const res = checked
            ? await grantProjectAccess({
                  project_id: projectId,
                  client_user_id: s.client_user_id,
                  role: s.access?.role ?? "viewer",
              })
            : s.access
              ? await revokeProjectAccess(s.access.id)
              : ({ success: true, data: undefined } as const);
        setPendingId(null);
        if (!res.success) {
            toast({
                title: "Error",
                description: res.error,
                variant: "destructive",
            });
            return;
        }
        toast({
            title: checked ? "Acceso otorgado" : "Acceso revocado",
        });
        router.refresh();
    };

    const handleRoleChange = async (
        accessId: string,
        role: "viewer" | "manager"
    ) => {
        const res = await updateProjectAccess({ id: accessId, role });
        if (!res.success) {
            toast({
                title: "Error al cambiar rol",
                description: res.error,
                variant: "destructive",
            });
            return;
        }
        toast({ title: "Rol actualizado" });
        router.refresh();
    };

    const handleVisibilityChange = async (
        clientUserId: string,
        seesAll: boolean
    ) => {
        const res = await updateClientUserVisibility({
            id: clientUserId,
            sees_all_projects: seesAll,
        });
        if (!res.success) {
            toast({
                title: "Error",
                description: res.error,
                variant: "destructive",
            });
            return;
        }
        toast({
            title: seesAll
                ? "Stakeholder ahora ve TODOS los proyectos"
                : "Stakeholder ahora solo ve proyectos asignados",
        });
        router.refresh();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Accesos por usuario</CardTitle>
                <CardDescription>
                    "Ve todos los proyectos del cliente" se usa para roles
                    transversales (ej. contable). Si está apagado, el
                    stakeholder solo ve los proyectos donde marcaste "Acceso"
                    abajo. El rol determina si puede comentar o solo leer.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {stakeholders.length === 0 ? (
                    <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Este cliente todavía no tiene usuarios del portal
                        configurados. Andá a la sección Clientes y activá el
                        acceso web del cliente.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                                    <th className="py-2 font-medium">Email</th>
                                    <th className="py-2 text-center font-medium">
                                        Ve todos los proyectos
                                    </th>
                                    <th className="py-2 text-center font-medium">
                                        Acceso a este proyecto
                                    </th>
                                    <th className="py-2 font-medium">Rol</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stakeholders.map((s) => {
                                    const hasAccess =
                                        !!s.access && !s.access.revoked_at;
                                    return (
                                        <tr
                                            key={s.client_user_id}
                                            className="border-b last:border-0"
                                        >
                                            <td className="py-3 font-mono text-xs">
                                                {s.email}
                                            </td>
                                            <td className="py-3 text-center">
                                                <Checkbox
                                                    checked={s.sees_all_projects}
                                                    onCheckedChange={(c) =>
                                                        handleVisibilityChange(
                                                            s.client_user_id,
                                                            c === true
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td className="py-3 text-center">
                                                {s.sees_all_projects ? (
                                                    <Badge variant="secondary">
                                                        Implícito
                                                    </Badge>
                                                ) : (
                                                    <Checkbox
                                                        checked={hasAccess}
                                                        disabled={
                                                            pendingId ===
                                                            s.client_user_id
                                                        }
                                                        onCheckedChange={(c) =>
                                                            handleToggleAccess(
                                                                s,
                                                                c === true
                                                            )
                                                        }
                                                    />
                                                )}
                                                {pendingId === s.client_user_id && (
                                                    <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
                                                )}
                                            </td>
                                            <td className="py-3">
                                                {hasAccess && s.access ? (
                                                    <Select
                                                        value={s.access.role}
                                                        onValueChange={(v) =>
                                                            handleRoleChange(
                                                                s.access!.id,
                                                                v as
                                                                    | "viewer"
                                                                    | "manager"
                                                            )
                                                        }
                                                    >
                                                        <SelectTrigger className="h-8 w-[140px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="viewer">
                                                                Viewer
                                                            </SelectItem>
                                                            <SelectItem value="manager">
                                                                Manager
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        —
                                                    </span>
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
    );
}

"use server";

import { prisma } from "@/lib/prisma/client";
import {
    getOwnerContext,
    canManageWorkspace,
} from "@/lib/auth/owner-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
    inviteTeamMemberSchema,
    updateTeamMemberSchema,
    removeTeamMemberSchema,
} from "@/lib/validations/team-members";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

function zodErrorMessage(err: ZodError): string {
    return err.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ");
}

export interface TeamMemberView {
    id: string;
    user_id: string;
    role: "collaborator" | "admin";
    default_rate: number | null;
    default_currency: string | null;
    invited_at: string;
    accepted_at: string | null;
    removed_at: string | null;
    email: string | null;
}

/**
 * Lista los miembros activos del workspace del owner.
 * - Owner ve todos los memberships (incluyendo los removidos para historial).
 * - Otros usuarios reciben array vacío (vista exclusiva del owner).
 */
export async function getTeamMembers(includeRemoved = false): Promise<TeamMemberView[]> {
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return [];
    }

    const members = await prisma.team_members.findMany({
        where: {
            owner_id: ctx.ownerId,
            ...(includeRemoved ? {} : { removed_at: null }),
        },
        orderBy: { invited_at: "desc" },
    });

    if (members.length === 0) return [];

    // Resolver emails desde auth.users (sin password ni metadata sensible).
    const admin = createAdminClient();
    const userIds = members.map((m) => m.user_id);
    const emailByUserId = new Map<string, string>();

    // Supabase Admin no tiene un endpoint masivo eficiente; iteramos.
    // Para workspaces típicos (1-10 miembros) es aceptable.
    await Promise.all(
        userIds.map(async (uid) => {
            try {
                const { data, error } = await admin.auth.admin.getUserById(uid);
                if (!error && data?.user?.email) {
                    emailByUserId.set(uid, data.user.email);
                }
            } catch {
                // Si la lookup falla para un user, dejamos email = null
            }
        })
    );

    return members.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role as "collaborator" | "admin",
        default_rate: m.default_rate != null ? Number(m.default_rate) : null,
        default_currency: m.default_currency ?? null,
        invited_at: m.invited_at.toISOString(),
        accepted_at: m.accepted_at?.toISOString() ?? null,
        removed_at: m.removed_at?.toISOString() ?? null,
        email: emailByUserId.get(m.user_id) ?? null,
    }));
}

/**
 * Invita un nuevo miembro al workspace.
 * - Si el email no existe en Supabase Auth, lo crea con la password provista.
 * - Si ya existe, simplemente lo vincula al workspace.
 * - Marca `accepted_at = now()` si el user fue creado con password directa
 *   (el flujo de magic-link con aceptación posterior queda para F10).
 */
export async function inviteTeamMember(input: {
    email: string;
    password: string;
    role: "collaborator" | "admin";
    default_rate?: number | null;
    default_currency?: string | null;
}): Promise<ActionResponse<{ membershipId: string; userId: string; created: boolean }>> {
    const parsed = inviteTeamMemberSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede invitar miembros.",
        };
    }

    const admin = createAdminClient();
    let userId: string | null = null;
    let userCreated = false;

    // 1. Buscar si el email ya tiene cuenta de Supabase Auth.
    try {
        const { data: list, error: listError } = await admin.auth.admin.listUsers({
            page: 1,
            perPage: 100,
        });
        if (listError) {
            return {
                success: false,
                error: `No se pudo verificar usuario existente: ${listError.message}`,
            };
        }
        const existing = list.users.find(
            (u) => u.email?.toLowerCase() === input.email.toLowerCase()
        );
        if (existing) {
            userId = existing.id;
        }
    } catch (err) {
        return {
            success: false,
            error:
                err instanceof Error
                    ? err.message
                    : "Error al verificar el usuario en Auth.",
        };
    }

    // 2. Si no existía, crearlo.
    if (!userId) {
        try {
            const { data: created, error: createError } =
                await admin.auth.admin.createUser({
                    email: input.email,
                    password: input.password,
                    email_confirm: true,
                    user_metadata: {
                        role: "TEAM_MEMBER",
                        invited_by: ctx.ownerId,
                    },
                });
            if (createError || !created.user) {
                return {
                    success: false,
                    error: createError?.message ?? "No se pudo crear el usuario.",
                };
            }
            userId = created.user.id;
            userCreated = true;
        } catch (err) {
            return {
                success: false,
                error:
                    err instanceof Error
                        ? err.message
                        : "Error al crear el usuario en Auth.",
            };
        }
    }

    // 3. Validar que no se esté auto-invitando.
    if (userId === ctx.ownerId) {
        return {
            success: false,
            error: "No podés invitarte a vos mismo como miembro.",
        };
    }

    // 4. Crear (o reactivar) el membership.
    try {
        const existingMembership = await prisma.team_members.findUnique({
            where: {
                owner_id_user_id: { owner_id: ctx.ownerId, user_id: userId },
            },
        });

        let membership;
        if (existingMembership) {
            membership = await prisma.team_members.update({
                where: { id: existingMembership.id },
                data: {
                    role: input.role,
                    default_rate: input.default_rate ?? null,
                    default_currency: input.default_currency ?? null,
                    removed_at: null,
                    accepted_at: userCreated ? new Date() : existingMembership.accepted_at ?? new Date(),
                },
            });
        } else {
            membership = await prisma.team_members.create({
                data: {
                    owner_id: ctx.ownerId,
                    user_id: userId,
                    role: input.role,
                    default_rate: input.default_rate ?? null,
                    default_currency: input.default_currency ?? null,
                    accepted_at: new Date(),
                },
            });
        }

        revalidatePath("/dashboard/settings/team");

        return {
            success: true,
            data: {
                membershipId: membership.id,
                userId,
                created: userCreated,
            },
        };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Error al crear el membership.",
        };
    }
}

export async function updateTeamMember(input: {
    id: string;
    role?: "collaborator" | "admin";
    default_rate?: number | null;
    default_currency?: string | null;
}): Promise<ActionResponse<void>> {
    const parsed = updateTeamMemberSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede editar miembros.",
        };
    }

    const member = await prisma.team_members.findFirst({
        where: { id: input.id, owner_id: ctx.ownerId },
    });
    if (!member) {
        return { success: false, error: "Miembro no encontrado." };
    }

    try {
        await prisma.team_members.update({
            where: { id: input.id },
            data: {
                ...(input.role !== undefined && { role: input.role }),
                ...(input.default_rate !== undefined && {
                    default_rate: input.default_rate,
                }),
                ...(input.default_currency !== undefined && {
                    default_currency: input.default_currency,
                }),
            },
        });
        revalidatePath("/dashboard/settings/team");
        return { success: true, data: undefined };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al actualizar.",
        };
    }
}

/**
 * Desactiva un miembro (soft-delete con `removed_at`). El usuario en
 * Supabase Auth NO se borra — puede ser miembro de otros workspaces o el
 * owner puede querer reinvitarlo más adelante.
 */
export async function removeTeamMember(id: string): Promise<ActionResponse<void>> {
    const parsed = removeTeamMemberSchema.safeParse({ id });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return {
            success: false,
            error: "Solo el dueño del workspace puede eliminar miembros.",
        };
    }

    const member = await prisma.team_members.findFirst({
        where: { id, owner_id: ctx.ownerId },
    });
    if (!member) {
        return { success: false, error: "Miembro no encontrado." };
    }

    try {
        await prisma.team_members.update({
            where: { id },
            data: { removed_at: new Date() },
        });
        revalidatePath("/dashboard/settings/team");
        return { success: true, data: undefined };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al eliminar.",
        };
    }
}

/**
 * §5 IMPROVEMENT_PLAN — Multi-user provider side (Opción B).
 *
 * Helper que resuelve el "owner context" del usuario autenticado:
 *
 * - Si el user es OWNER (tiene clientes a su nombre) → contexto owner,
 *   ownerId = su propio user.id.
 * - Si es TEAM MEMBER activo (membership en `team_members` con
 *   `removed_at IS NULL`) → contexto member, ownerId = `owner_id` del
 *   membership.
 * - Si NO es ninguno (típicamente recién registrado, no creó cliente todavía)
 *   → contexto owner "vacío" con su propio user.id (puede crear clientes
 *   y se convierte en owner automáticamente al hacerlo).
 *
 * Todas las queries de "datos del workspace" (clients, projects, tasks,
 * time_entries, invoices, ...) deben filtrar por `ownerId` en lugar de
 * `user.id`. Las queries de autoría (quién creó qué time_entry) siguen
 * usando `user.id`.
 *
 * El resultado se cachea con `cache()` de React por request — múltiples
 * Server Actions en el mismo request comparten la lectura.
 */

import { cache } from "react";
import { getAuthUser } from "./server";
import { prisma } from "@/lib/prisma/client";

export type TeamRole = "collaborator" | "admin";
export type OwnerContextRole = "owner" | TeamRole;

export interface OwnerContext {
    /** El user.id que actúa como dueño del workspace efectivo. */
    ownerId: string;
    /** El user.id del usuario logueado (puede coincidir con ownerId si es owner). */
    actorId: string;
    /** True si el usuario logueado es el dueño directo. */
    isOwner: boolean;
    /** Rol efectivo en el workspace. */
    role: OwnerContextRole;
    /** Id del membership en `team_members` (solo si role != 'owner'). */
    membershipId?: string;
}

export const getOwnerContext = cache(async (): Promise<OwnerContext> => {
    const user = await getAuthUser();

    // ¿Es team member activo de algún owner?
    // Lookup explícito antes de chequear "es owner" para que un user pueda
    // ser simultáneamente owner de sus propios clientes Y member de otro
    // workspace; en ese caso priorizamos el rol de member solo si NO tiene
    // clientes propios. Si tiene ambos, queda como owner de su workspace
    // por defecto (no soportamos cambio de workspace en esta versión).
    const ownsAnyClient = await prisma.clients.findFirst({
        where: { user_id: user.id },
        select: { id: true },
    });

    if (ownsAnyClient) {
        return {
            ownerId: user.id,
            actorId: user.id,
            isOwner: true,
            role: "owner",
        };
    }

    const membership = await prisma.team_members.findFirst({
        where: { user_id: user.id, removed_at: null },
        select: { id: true, owner_id: true, role: true },
        orderBy: { invited_at: "asc" }, // En caso de pertenecer a varios, el más antiguo.
    });

    if (membership) {
        return {
            ownerId: membership.owner_id,
            actorId: user.id,
            isOwner: false,
            role: membership.role as TeamRole,
            membershipId: membership.id,
        };
    }

    // User autenticado sin clientes propios ni memberships:
    // se considera owner "vacío" de su propio workspace. Apenas cree un
    // cliente, automáticamente queda en el branch isOwner=true.
    return {
        ownerId: user.id,
        actorId: user.id,
        isOwner: true,
        role: "owner",
    };
});

/**
 * Variante que devuelve null si la auth falla (no throw).
 * Útil en componentes que pueden renderizarse sin sesión.
 */
export const getOwnerContextOrNull = cache(
    async (): Promise<OwnerContext | null> => {
        try {
            return await getOwnerContext();
        } catch {
            return null;
        }
    }
);

/**
 * Helper para gating de UI/Server Actions. True si el contexto permite ver
 * datos financieros (invoices, payments, totales monetarios).
 *
 * - Owner: SÍ.
 * - Admin (team member): SÍ.
 * - Collaborator (team member): NO. Solo ve sus time entries.
 */
export function canSeeFinancials(ctx: OwnerContext): boolean {
    return ctx.role === "owner" || ctx.role === "admin";
}

/**
 * Helper para gating: solo el owner puede mutar clients/projects/tasks.
 */
export function canManageWorkspace(ctx: OwnerContext): boolean {
    return ctx.role === "owner";
}

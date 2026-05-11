/**
 * §6 / F4 IMPROVEMENT_PLAN — Multi-stakeholder client side.
 *
 * Helper que resuelve qué proyectos del cliente puede ver el usuario
 * autenticado del portal:
 *
 * - Si el user es el `clients.portal_user_id` (cliente "principal" o
 *   legacy) → ve TODOS los proyectos del cliente.
 * - Si es `client_users.user_id` con `sees_all_projects = true` → ve
 *   TODOS los proyectos del cliente.
 * - Si es `client_users.user_id` con `sees_all_projects = false` → ve
 *   solo los `projects` listados en `project_access` con `revoked_at = null`.
 *
 * Devuelve el filtro listo para componer en queries Prisma.
 */

import { cache } from "react";
import { getAuthUserOrNull, getClientContext } from "./server";
import { prisma } from "@/lib/prisma/client";

export type PortalProjectFilter =
    | { kind: "all"; clientId: string; clientUserId: string | null }
    | { kind: "restricted"; clientId: string; clientUserId: string; projectIds: string[] };

/**
 * Devuelve el filtro de proyectos accesibles, o `null` si no es portal client.
 */
export const getPortalProjectFilter = cache(
    async (): Promise<PortalProjectFilter | null> => {
        const ctx = await getClientContext();
        if (!ctx) return null;

        const user = await getAuthUserOrNull();
        if (!user) return null;

        // 1. ¿Es el portal_user_id directo del cliente? → ve todo
        const directLink = await prisma.clients.findFirst({
            where: { id: ctx.clientId, portal_user_id: user.id },
            select: { id: true },
        });
        if (directLink) {
            return { kind: "all", clientId: ctx.clientId, clientUserId: null };
        }

        // 2. Es un client_user: chequear sees_all_projects + project_access
        const clientUser = await prisma.client_users.findFirst({
            where: { client_id: ctx.clientId, user_id: user.id },
            select: { id: true, sees_all_projects: true },
        });
        if (!clientUser) {
            // No debería pasar (getClientContext ya validó), pero conservador:
            return null;
        }

        if (clientUser.sees_all_projects) {
            return {
                kind: "all",
                clientId: ctx.clientId,
                clientUserId: clientUser.id,
            };
        }

        // Restringido: traer los project_ids asignados sin revocar
        const accesses = await prisma.project_access.findMany({
            where: {
                client_user_id: clientUser.id,
                revoked_at: null,
            },
            select: { project_id: true },
        });

        return {
            kind: "restricted",
            clientId: ctx.clientId,
            clientUserId: clientUser.id,
            projectIds: accesses.map((a) => a.project_id),
        };
    }
);

/**
 * Sugar: devuelve un fragmento de `where` Prisma para filtrar por
 * `project_id`. Útil cuando la query ya filtra por `client_id`.
 *
 * - `kind: "all"`     → `{}` (sin filtro adicional).
 * - `kind: "restricted"` → `{ id: { in: projectIds } }` o
 *                          `{ id: { in: [...] } }` con array que puede ser
 *                          vacío (la query devolverá 0 filas, esperado).
 */
export function projectIdFilter(
    filter: PortalProjectFilter
): { id?: { in: string[] } } {
    if (filter.kind === "all") return {};
    return { id: { in: filter.projectIds } };
}

/**
 * Variante para filtrar time_entries / tasks / etc. vía
 * `tasks.project_id`.
 */
export function taskProjectIdFilter(
    filter: PortalProjectFilter
): { project_id?: { in: string[] } } {
    if (filter.kind === "all") return {};
    return { project_id: { in: filter.projectIds } };
}

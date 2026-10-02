/**
 * Autenticación por API key (agentes de IA / MCP).
 *
 * La key actúa COMO el usuario que la creó: el owner context se resuelve en
 * cada request con la misma regla que la sesión web (`resolveOwnerContextForUser`).
 * Si el usuario deja de ser team member, su contexto pasa a un workspace vacío
 * y la key deja de ver datos del owner sin tener que revocarla.
 *
 * Regla de Oro #1: Prisma bypasea la RLS → los módulos que reciben un
 * `ApiContext` (lib/domain/*) filtran SIEMPRE por `ownerId` / `actorId`.
 */

import "server-only";
import { prisma } from "@/lib/prisma/client";
import {
    canSeeFinancials,
    resolveOwnerContextForUser,
    type OwnerContext,
} from "./owner-context";
import {
    extractApiKey,
    hashApiKey,
    isApiKeyScope,
    type ApiKeyScope,
} from "./api-key-token";

export interface ApiContext extends OwnerContext {
    apiKeyId: string;
    scopes: ApiKeyScope[];
    /** Scope 'financials' en la key Y rol que puede ver finanzas (owner/admin). */
    financials: boolean;
}

export type ApiAuthResult =
    | { ok: true; ctx: ApiContext }
    | { ok: false; status: 401 | 403; error: string };

/** No re-escribir `last_used_at` en cada request (evita un UPDATE por llamada). */
const LAST_USED_RESOLUTION_MS = 60_000;

export async function authenticateApiKey(
    authorizationHeader: string | null | undefined
): Promise<ApiAuthResult> {
    const token = extractApiKey(authorizationHeader);
    if (!token) {
        return {
            ok: false,
            status: 401,
            error: "Falta la API key o tiene formato inválido (Authorization: Bearer mk_...).",
        };
    }

    const key = await prisma.api_keys.findUnique({
        where: { key_hash: hashApiKey(token) },
    });

    const now = new Date();
    if (!key || key.revoked_at || (key.expires_at && key.expires_at <= now)) {
        return { ok: false, status: 401, error: "API key inválida, revocada o vencida." };
    }

    // Un usuario del portal de clientes nunca opera el workspace del proveedor.
    const [portalClient, portalLink] = await Promise.all([
        prisma.clients.findFirst({ where: { portal_user_id: key.user_id }, select: { id: true } }),
        prisma.client_users.findFirst({ where: { user_id: key.user_id }, select: { id: true } }),
    ]);
    if (portalClient || portalLink) {
        return { ok: false, status: 403, error: "Esta API key no tiene acceso al workspace." };
    }

    const owner = await resolveOwnerContextForUser(key.user_id);
    const scopes = key.scopes.filter(isApiKeyScope);

    if (!key.last_used_at || now.getTime() - key.last_used_at.getTime() > LAST_USED_RESOLUTION_MS) {
        await prisma.api_keys.update({
            where: { id: key.id },
            data: { last_used_at: now },
        });
    }

    return {
        ok: true,
        ctx: {
            ...owner,
            apiKeyId: key.id,
            scopes,
            financials: scopes.includes("financials") && canSeeFinancials(owner),
        },
    };
}

/** Devuelve un mensaje de error si la key no tiene el scope, o null si lo tiene. */
export function missingScope(ctx: ApiContext, scope: ApiKeyScope): string | null {
    return ctx.scopes.includes(scope)
        ? null
        : `Esta API key no tiene el permiso '${scope}'.`;
}

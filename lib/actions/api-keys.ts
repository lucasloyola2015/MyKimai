"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser, getClientContext } from "@/lib/auth/server";
import { canSeeFinancials, getOwnerContext } from "@/lib/auth/owner-context";
import { generateApiKey } from "@/lib/auth/api-key-token";
import { revalidatePath } from "next/cache";
import {
    createApiKeySchema,
    revokeApiKeySchema,
    type CreateApiKeyInput,
} from "@/lib/validations/api-keys";
import { safeActionError, zodErrorMessage } from "@/lib/validations/utils";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

export interface ApiKeyView {
    id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
}

/** Máximo de keys activas por usuario. */
const MAX_ACTIVE_KEYS = 10;

const PAGE_PATH = "/dashboard/settings/api-keys";

const toView = (k: {
    id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    created_at: Date;
    last_used_at: Date | null;
    expires_at: Date | null;
    revoked_at: Date | null;
}): ApiKeyView => ({
    id: k.id,
    name: k.name,
    key_prefix: k.key_prefix,
    scopes: k.scopes,
    created_at: k.created_at.toISOString(),
    last_used_at: k.last_used_at?.toISOString() ?? null,
    expires_at: k.expires_at?.toISOString() ?? null,
    revoked_at: k.revoked_at?.toISOString() ?? null,
});

const viewSelect = {
    id: true,
    name: true,
    key_prefix: true,
    scopes: true,
    created_at: true,
    last_used_at: true,
    expires_at: true,
    revoked_at: true,
} as const;

/** Keys del usuario logueado (las propias; cada uno gestiona las suyas). */
export async function listApiKeys(): Promise<ApiKeyView[]> {
    const user = await getAuthUser();
    const keys = await prisma.api_keys.findMany({
        where: { user_id: user.id },
        select: viewSelect,
        orderBy: { created_at: "desc" },
    });
    return keys.map(toView);
}

/** True si el usuario puede pedir el permiso 'financials' (owner/admin). */
export async function canRequestFinancialScope(): Promise<boolean> {
    return canSeeFinancials(await getOwnerContext());
}

/**
 * Crea una key. El valor en claro se devuelve UNA sola vez; en la DB queda el hash.
 */
export async function createApiKey(
    input: CreateApiKeyInput
): Promise<ActionResponse<{ key: string; apiKey: ApiKeyView }>> {
    const parsed = createApiKeySchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    try {
        const user = await getAuthUser();
        if (await getClientContext()) {
            return { success: false, error: "Los usuarios del portal no pueden crear API keys." };
        }

        const { name, scopes, expires_in_days } = parsed.data;
        if (scopes.includes("financials") && !canSeeFinancials(await getOwnerContext())) {
            return { success: false, error: "Tu rol no puede ver datos financieros." };
        }

        const now = new Date();
        const active = await prisma.api_keys.count({
            where: {
                user_id: user.id,
                revoked_at: null,
                OR: [{ expires_at: null }, { expires_at: { gt: now } }],
            },
        });
        if (active >= MAX_ACTIVE_KEYS) {
            return {
                success: false,
                error: `Llegaste al máximo de ${MAX_ACTIVE_KEYS} keys activas. Revocá alguna primero.`,
            };
        }

        const { key, prefix, hash } = generateApiKey();
        const created = await prisma.api_keys.create({
            data: {
                user_id: user.id,
                name,
                key_prefix: prefix,
                key_hash: hash,
                scopes,
                expires_at: expires_in_days
                    ? new Date(now.getTime() + expires_in_days * 86_400_000)
                    : null,
            },
            select: viewSelect,
        });

        revalidatePath(PAGE_PATH);
        return { success: true, data: { key, apiKey: toView(created) } };
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo crear la API key.") };
    }
}

/** Revoca una key propia (queda en la lista como historial). */
export async function revokeApiKey(id: string): Promise<ActionResponse<ApiKeyView>> {
    const parsed = revokeApiKeySchema.safeParse({ id });
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    try {
        const user = await getAuthUser();
        const key = await prisma.api_keys.findFirst({
            where: { id: parsed.data.id, user_id: user.id },
            select: { id: true, revoked_at: true },
        });
        if (!key) return { success: false, error: "API key no encontrada." };
        if (key.revoked_at) return { success: false, error: "La API key ya estaba revocada." };

        const revoked = await prisma.api_keys.update({
            where: { id: key.id },
            data: { revoked_at: new Date() },
            select: viewSelect,
        });

        revalidatePath(PAGE_PATH);
        return { success: true, data: toView(revoked) };
    } catch (error) {
        return { success: false, error: safeActionError(error, "No se pudo revocar la API key.") };
    }
}

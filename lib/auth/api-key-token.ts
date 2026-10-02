/**
 * Formato y hashing de las API keys (lógica pura, sin DB → testeable).
 *
 * Formato: `mk_` + 32 bytes aleatorios en base64url (43 chars) = 46 chars.
 * En la DB solo se guarda el sha256 (hex) y un prefijo visible para
 * identificarla en la UI. Como la key tiene 256 bits de entropía, sha256
 * alcanza (no hace falta un KDF lento tipo bcrypt).
 */

import { createHash, randomBytes } from "crypto";

export const API_KEY_SCOPES = ["read", "write", "financials"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const KEY_PREFIX = "mk_";
/** Largo del prefijo visible en la UI: "mk_" + 8 chars. */
const DISPLAY_PREFIX_LENGTH = 11;
const KEY_PATTERN = /^mk_[A-Za-z0-9_-]{43}$/;

export function hashApiKey(key: string): string {
    return createHash("sha256").update(key, "utf8").digest("hex");
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
    const key = KEY_PREFIX + randomBytes(32).toString("base64url");
    return {
        key,
        prefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
        hash: hashApiKey(key),
    };
}

export function isWellFormedApiKey(token: string): boolean {
    return KEY_PATTERN.test(token);
}

/**
 * Extrae la key de un header `Authorization: Bearer mk_...`.
 * Devuelve null si falta, no es Bearer o no tiene el formato de una key.
 */
export function extractApiKey(authorizationHeader: string | null | undefined): string | null {
    if (!authorizationHeader) return null;
    const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
    if (!match) return null;
    return isWellFormedApiKey(match[1]) ? match[1] : null;
}

export function isApiKeyScope(value: string): value is ApiKeyScope {
    return (API_KEY_SCOPES as readonly string[]).includes(value);
}

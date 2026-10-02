import { describe, it, expect } from "vitest";
import {
    extractApiKey,
    generateApiKey,
    hashApiKey,
    isApiKeyScope,
    isWellFormedApiKey,
} from "@/lib/auth/api-key-token";

describe("generateApiKey", () => {
    it("genera keys mk_ de 46 chars, con prefijo visible y hash sha256", () => {
        const { key, prefix, hash } = generateApiKey();
        expect(key).toMatch(/^mk_[A-Za-z0-9_-]{43}$/);
        expect(prefix).toBe(key.slice(0, 11));
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(hash).toBe(hashApiKey(key));
    });

    it("no repite keys", () => {
        const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().key));
        expect(keys.size).toBe(50);
    });

    it("el hash no contiene la key", () => {
        const { key, hash } = generateApiKey();
        expect(hash).not.toContain(key.slice(3));
    });
});

describe("extractApiKey", () => {
    const { key } = generateApiKey();

    it("acepta 'Bearer <key>' (case-insensitive, con espacios extra)", () => {
        expect(extractApiKey(`Bearer ${key}`)).toBe(key);
        expect(extractApiKey(`bearer   ${key}  `)).toBe(key);
    });

    it("rechaza header ausente, otro esquema o token mal formado", () => {
        expect(extractApiKey(null)).toBeNull();
        expect(extractApiKey(undefined)).toBeNull();
        expect(extractApiKey("")).toBeNull();
        expect(extractApiKey(key)).toBeNull();
        expect(extractApiKey(`Basic ${key}`)).toBeNull();
        expect(extractApiKey("Bearer mk_corta")).toBeNull();
        expect(extractApiKey(`Bearer ${key} extra`)).toBeNull();
        expect(extractApiKey(`Bearer ${key.replace("mk_", "sk_")}`)).toBeNull();
    });
});

describe("isWellFormedApiKey / isApiKeyScope", () => {
    it("valida formato", () => {
        expect(isWellFormedApiKey(generateApiKey().key)).toBe(true);
        expect(isWellFormedApiKey("mk_" + "a".repeat(42))).toBe(false);
        expect(isWellFormedApiKey("mk_" + "a".repeat(42) + "!")).toBe(false);
    });

    it("solo reconoce los scopes definidos", () => {
        expect(isApiKeyScope("read")).toBe(true);
        expect(isApiKeyScope("write")).toBe(true);
        expect(isApiKeyScope("financials")).toBe(true);
        expect(isApiKeyScope("admin")).toBe(false);
    });
});

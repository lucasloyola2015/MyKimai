import { z } from "zod";
import { API_KEY_SCOPES } from "@/lib/auth/api-key-token";

export const createApiKeySchema = z.object({
    name: z.string().trim().min(1, "Poné un nombre para reconocerla").max(100),
    scopes: z
        .array(z.enum(API_KEY_SCOPES))
        .min(1)
        .refine((s) => new Set(s).size === s.length, "Permisos repetidos")
        .refine((s) => s.includes("read"), "Toda key necesita el permiso 'read'"),
    /** null = sin vencimiento. */
    expires_in_days: z.number().int().min(1).max(3650).nullable(),
});
export type CreateApiKeyInput = z.input<typeof createApiKeySchema>;

export const revokeApiKeySchema = z.object({
    id: z.string().uuid({ message: "ID inválido (esperado UUID)" }),
});

import { createServerComponentClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";

/**
 * Helper para agregar timeout a una promesa
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error("Authentication timeout")), timeoutMs)
        ),
    ]);
}

/**
 * Helper para obtener el usuario autenticado en Server Actions
 * @throws Error si no hay usuario autenticado o si hay timeout
 */
export async function getAuthUser(): Promise<User> {
    try {
        const supabase = await createServerComponentClient();
        
        // Timeout de 3 segundos para evitar bloqueos
        const getUserPromise = supabase.auth.getUser();
        const {
            data: { user },
            error,
        } = await withTimeout(getUserPromise, 3000);

        if (error || !user) {
            throw new Error("Unauthorized");
        }

        return user;
    } catch (error) {
        // Si es un timeout, lanzar error más descriptivo
        if (error instanceof Error && error.message === "Authentication timeout") {
            console.error("Authentication timeout - possible connection issue");
            throw new Error("Authentication timeout");
        }
        throw error;
    }
}

/**
 * Helper para obtener el usuario autenticado (nullable)
 * Útil cuando la autenticación es opcional
 */
export async function getAuthUserOrNull(): Promise<User | null> {
    try {
        return await getAuthUser();
    } catch {
        return null;
    }
}

/**
 * Helper para verificar si el usuario tiene acceso a un cliente
 */
export async function verifyClientAccess(clientId: string): Promise<boolean> {
    const user = await getAuthUser();
    const supabase = await createServerComponentClient();

    const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .eq("user_id", user.id)
        .single();

    return !!data;
}

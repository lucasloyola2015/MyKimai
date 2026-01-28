import { createServerComponentClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";

/**
 * Helper para obtener el usuario autenticado en Server Actions
 * @throws Error si no hay usuario autenticado
 */
export async function getAuthUser(): Promise<User> {
    const supabase = await createServerComponentClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error("Unauthorized");
    }

    return user;
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

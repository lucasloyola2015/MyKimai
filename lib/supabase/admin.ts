import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con Service Role Key para operaciones de administración.
 * Necesario para auth.admin (createUser, updateUserById) y gestión de usuarios
 * sin sesión del cliente. No exponer en el cliente.
 */
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error("Missing Supabase admin environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
    }

    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

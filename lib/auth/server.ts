import { createServerComponentClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma/client";
import { cache } from "react";

/**
 * Helper para obtener el usuario autenticado en Server Actions con cache
 * Esto evita múltiples llamadas a Supabase Auth en el mismo request
 */
export const getAuthUser = cache(async (): Promise<User> => {
    const supabase = await createServerComponentClient();

    // Obtenemos el usuario. No usamos timeout custom aquí para evitar AbortErrors
    // Supabase ya maneja sus propios tiempos de espera y reintentos.
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error("Unauthorized");
    }

    return user;
});

/**
 * Helper para obtener el usuario autenticado (nullable) con cache
 */
export const getAuthUserOrNull = cache(async (): Promise<User | null> => {
    try {
        return await getAuthUser();
    } catch {
        return null;
    }
});

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

/**
 * Obtiene el contexto del cliente si el usuario autenticado es un cliente
 * Envuelto en cache() para evitar consultas repetitivas a la DB
 */
export const getClientContext = cache(async (): Promise<{ clientId: string; role: string; name: string } | null> => {
    const user = await getAuthUserOrNull();
    if (!user) return null;

    // 1. Verificar si el usuario está vinculado directamente como portal_user_id (Prioridad)
    const client = await prisma.clients.findFirst({
        where: { portal_user_id: user.id },
        select: { id: true, name: true }
    });

    if (client) {
        console.log(`[AUTH] User ${user.id} matched client ${client.id} (direct portal_user_id)`);
        return { clientId: client.id, role: "CLIENT", name: client.name };
    }

    // 2. Verificar si está vinculado a través de client_users (accesos compartidos)
    const clientUser = await prisma.client_users.findFirst({
        where: { user_id: user.id },
        include: { client: { select: { name: true } } }
    });

    if (clientUser) {
        console.log(`[AUTH] User ${user.id} matched client ${clientUser.client_id} (client_users link)`);
        return { clientId: clientUser.client_id, role: "CLIENT", name: clientUser.client.name };
    }

    console.log(`[AUTH] User ${user.id} is NOT a portal client.`);
    return null;
});

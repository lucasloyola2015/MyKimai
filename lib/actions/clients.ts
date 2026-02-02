"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import type { clients } from "@prisma/client";

import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Obtiene todos los clientes del usuario autenticado
 */
export async function getClients() {
    const user = await getAuthUser();

    const clients = await prisma.clients.findMany({
        where: {
            user_id: user.id,
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return clients;
}

/**
 * Obtiene un cliente por ID
 */
export async function getClient(id: string) {
    const user = await getAuthUser();

    const client = await prisma.clients.findFirst({
        where: {
            id,
            user_id: user.id,
        },
    });

    return client;
}

/**
 * Crea un nuevo cliente
 */
export async function createClient(data: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    currency?: string;
    default_rate?: number | null;
    notes?: string | null;
}): Promise<ActionResponse<clients>> {
    const user = await getAuthUser();

    try {
        const client = await prisma.clients.create({
            data: {
                ...data,
                user_id: user.id,
                currency: data.currency || "USD",
            },
        });

        revalidatePath("/dashboard/clients");

        return {
            success: true,
            data: client,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al crear el cliente",
        };
    }
}

/**
 * Actualiza un cliente existente
 */
export async function updateClient(
    id: string,
    data: {
        name?: string;
        email?: string | null;
        phone?: string | null;
        address?: string | null;
        currency?: string;
        default_rate?: number | null;
        notes?: string | null;
    }
): Promise<ActionResponse<clients>> {
    const user = await getAuthUser();

    // Verificar que el cliente pertenece al usuario
    const existing = await prisma.clients.findFirst({
        where: {
            id,
            user_id: user.id,
        },
    });

    if (!existing) {
        return {
            success: false,
            error: "Cliente no encontrado.",
        };
    }

    try {
        const client = await prisma.clients.update({
            where: { id },
            data,
        });

        revalidatePath("/dashboard/clients");

        return {
            success: true,
            data: client,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al actualizar el cliente",
        };
    }
}

/**
 * Elimina un cliente
 */
export async function deleteClient(id: string) {
    const user = await getAuthUser();

    // Verificar que el cliente pertenece al usuario
    const existing = await prisma.clients.findFirst({
        where: {
            id,
            user_id: user.id,
        },
    });

    if (!existing) {
        return {
            success: false,
            error: "Cliente no encontrado.",
        };
    }

    await prisma.clients.delete({
        where: { id },
    });

    revalidatePath("/dashboard/clients");

    return {
        success: true,
    };
}

/**
 * Activa o desactiva el acceso web para un cliente
 */
export async function toggleClientWebAccess(
    clientId: string,
    enabled: boolean,
    password?: string
): Promise<ActionResponse<clients>> {
    const user = await getAuthUser();

    // 1. Verificar que el cliente pertenece al usuario admin
    const client = await prisma.clients.findFirst({
        where: {
            id: clientId,
            user_id: user.id,
        },
    });

    if (!client) {
        return { success: false, error: "Cliente no encontrado." };
    }

    try {
        if (enabled) {
            if (!client.email) {
                return { success: false, error: "El cliente debe tener un email para habilitar el acceso web." };
            }
            if (!password) {
                return { success: false, error: "Se requiere una contraseña para activar el acceso." };
            }

            const admin = createAdminClient();
            let portalUserId = client.portal_user_id;

            // 2. Crear o actualizar usuario en Supabase Auth
            if (!portalUserId) {
                const { data: authUser, error: authError } = await admin.auth.admin.createUser({
                    email: client.email,
                    password: password,
                    email_confirm: true,
                    user_metadata: {
                        role: "CLIENT",
                        client_id: client.id,
                        client_name: client.name,
                    },
                    app_metadata: {
                        role: "CLIENT",
                    }
                });

                if (authError) {
                    return { success: false, error: `Error en Supabase Auth: ${authError.message}` };
                }
                portalUserId = authUser.user.id;
            } else {
                // Actualizar contraseña si se proporciona
                const { error: updateError } = await admin.auth.admin.updateUserById(portalUserId, {
                    password: password,
                    user_metadata: {
                        role: "CLIENT",
                        client_id: client.id,
                    },
                    app_metadata: {
                        role: "CLIENT",
                    }
                });
                if (updateError) {
                    return { success: false, error: `Error actualizando auth: ${updateError.message}` };
                }
            }

            // 3. Actualizar el registro del cliente
            const updatedClient = await prisma.clients.update({
                where: { id: clientId },
                data: {
                    web_access_enabled: true,
                    portal_user_id: portalUserId,
                },
            });

            revalidatePath("/dashboard/clients");
            return { success: true, data: updatedClient };
        } else {
            // Desactivar acceso
            const updatedClient = await prisma.clients.update({
                where: { id: clientId },
                data: {
                    web_access_enabled: false,
                },
            });

            revalidatePath("/dashboard/clients");
            return { success: true, data: updatedClient };
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al procesar el acceso web",
        };
    }
}

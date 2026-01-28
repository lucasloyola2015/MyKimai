"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import type { clients } from "@prisma/client";

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

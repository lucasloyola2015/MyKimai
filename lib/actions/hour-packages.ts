"use server";

import { prisma } from "@/lib/prisma/client";
import { getOwnerContext, canManageWorkspace } from "@/lib/auth/owner-context";
import { revalidatePath } from "next/cache";
import {
    createHourPackageSchema,
    updateHourPackageSchema,
} from "@/lib/validations/hour-packages";
import { zodErrorMessage } from "@/lib/validations/utils";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * §migrate-anon — Lista los paquetes de horas del workspace efectivo (owner).
 * Reemplaza la lectura con supabase-js (anon + RLS) de la página.
 */
export async function getHourPackages() {
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) return [];

    return prisma.hour_packages.findMany({
        where: { clients: { user_id: ctx.ownerId } },
        include: {
            clients: true,
            projects: true,
        },
        orderBy: { purchased_at: "desc" },
    });
}

export async function createHourPackage(data: {
    client_id: string;
    project_id?: string | null;
    hours: number;
    price: number;
    currency?: string;
    expires_at?: Date | null;
    notes?: string | null;
    reserved_for_client_user_id?: string | null;
}): Promise<ActionResponse<{ id: string }>> {
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, error: "Solo el dueño del workspace puede crear paquetes." };
    }

    const parsed = createHourPackageSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }
    const input = parsed.data;

    // El cliente (y el proyecto, si viene) deben pertenecer al workspace.
    const client = await prisma.clients.findFirst({
        where: { id: input.client_id, user_id: ctx.ownerId },
        select: { id: true, currency: true },
    });
    if (!client) return { success: false, error: "Cliente no encontrado." };

    if (input.project_id) {
        const project = await prisma.projects.findFirst({
            where: { id: input.project_id, client_id: input.client_id },
            select: { id: true },
        });
        if (!project) return { success: false, error: "El proyecto no pertenece a este cliente." };
    }

    try {
        const pkg = await prisma.hour_packages.create({
            data: {
                client_id: input.client_id,
                project_id: input.project_id ?? null,
                hours: input.hours,
                price: input.price,
                currency: input.currency || client.currency || "USD",
                expires_at: input.expires_at ?? null,
                notes: input.notes ?? null,
                reserved_for_client_user_id: input.reserved_for_client_user_id ?? null,
                // hours_used: lo gestiona el trigger (§4.3), default 0 en DB.
            },
            select: { id: true },
        });
        revalidatePath("/dashboard/hour-packages");
        return { success: true, data: { id: pkg.id } };
    } catch (error) {
        console.error("Error createHourPackage:", error);
        return { success: false, error: "Error al crear el paquete." };
    }
}

export async function updateHourPackage(
    id: string,
    data: {
        project_id?: string | null;
        hours?: number;
        price?: number;
        currency?: string;
        expires_at?: Date | null;
        notes?: string | null;
        reserved_for_client_user_id?: string | null;
    }
): Promise<ActionResponse<{ id: string }>> {
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, error: "Solo el dueño del workspace puede editar paquetes." };
    }

    const parsed = updateHourPackageSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: zodErrorMessage(parsed.error) };
    }

    const existing = await prisma.hour_packages.findFirst({
        where: { id, clients: { user_id: ctx.ownerId } },
        select: { id: true, client_id: true },
    });
    if (!existing) return { success: false, error: "Paquete no encontrado." };

    if (parsed.data.project_id) {
        const project = await prisma.projects.findFirst({
            where: { id: parsed.data.project_id, client_id: existing.client_id },
            select: { id: true },
        });
        if (!project) return { success: false, error: "El proyecto no pertenece a este cliente." };
    }

    try {
        await prisma.hour_packages.update({
            where: { id },
            data: { ...parsed.data }, // sin hours_used (lo mantiene el trigger)
        });
        revalidatePath("/dashboard/hour-packages");
        return { success: true, data: { id } };
    } catch (error) {
        console.error("Error updateHourPackage:", error);
        return { success: false, error: "Error al actualizar el paquete." };
    }
}

export async function deleteHourPackage(id: string): Promise<ActionResponse<null>> {
    const ctx = await getOwnerContext();
    if (!canManageWorkspace(ctx)) {
        return { success: false, error: "Solo el dueño del workspace puede eliminar paquetes." };
    }

    const existing = await prisma.hour_packages.findFirst({
        where: { id, clients: { user_id: ctx.ownerId } },
        select: { id: true },
    });
    if (!existing) return { success: false, error: "Paquete no encontrado." };

    try {
        // Las time_entries linkeadas quedan con consumed_from_package_id = NULL
        // (ON DELETE SET NULL) → vuelven a ser facturables por hora.
        await prisma.hour_packages.delete({ where: { id } });
        revalidatePath("/dashboard/hour-packages");
        return { success: true, data: null };
    } catch (error) {
        console.error("Error deleteHourPackage:", error);
        return { success: false, error: "Error al eliminar el paquete." };
    }
}

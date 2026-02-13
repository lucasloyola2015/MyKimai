"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

export type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Obtiene la configuración fiscal del usuario autenticado
 * Si no existe configuración, retorna null (el frontend usará valores por defecto)
 */
export async function getUserFiscalSettings() {
    const user = await getAuthUser();

    const settings = await prisma.user_fiscal_settings.findUnique({
        where: { user_id: user.id },
    });

    return settings;
}

/**
 * Actualiza o crea la configuración fiscal del usuario
 */
export async function updateUserFiscalSettings(data: {
    business_name?: string;
    tax_id?: string;
    legal_address?: string;
    tax_condition?: string;
    gross_income?: string;
    activity_start_date?: string;
    logo_url?: string;
    phone?: string;
    email?: string;
}): Promise<ActionResponse<any>> {
    const user = await getAuthUser();

    try {
        // Preparar datos para la base de datos
        const dbData: any = { ...data };
        
        // Convertir activity_start_date de string a Date si existe
        // Parsear como fecha local para evitar problemas de zona horaria
        if (data.activity_start_date) {
            // Parsear "YYYY-MM-DD" como fecha local (no UTC)
            const [year, month, day] = data.activity_start_date.split('-').map(Number);
            dbData.activity_start_date = new Date(year, month - 1, day);
        } else if (data.activity_start_date === "") {
            dbData.activity_start_date = null;
        }

        // Upsert: crear si no existe, actualizar si existe
        const settings = await prisma.user_fiscal_settings.upsert({
            where: { user_id: user.id },
            update: {
                ...dbData,
                updated_at: new Date(),
            },
            create: {
                user_id: user.id,
                ...dbData,
            },
        });

        revalidatePath("/dashboard/settings");
        revalidatePath("/dashboard/billing");

        return {
            success: true,
            data: settings,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error al guardar la configuración",
        };
    }
}

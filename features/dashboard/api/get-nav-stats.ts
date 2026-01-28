"use server";

import { createServerComponentClient } from "@/lib/supabase/server";
import { startOfDay, endOfDay } from "date-fns";
import type { NavStats } from "@/shared/types/sidebar.types";

export async function getNavStats(): Promise<NavStats> {
    const supabase = await createServerComponentClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("Unauthorized");
    }

    // Queries en paralelo para mejor performance
    const [projectsCount, invoicesCount, activeEntry, todayEntries] =
        await Promise.all([
            // Proyectos activos
            supabase
                .from("projects")
                .select("*, clients!inner(user_id)", { count: "exact", head: true })
                .eq("clients.user_id", user.id)
                .eq("status", "active"),

            // Facturas pendientes (draft + sent)
            supabase
                .from("invoices")
                .select("*, clients!inner(user_id)", { count: "exact", head: true })
                .eq("clients.user_id", user.id)
                .in("status", ["draft", "sent"]),

            // Timer activo
            supabase
                .from("time_entries")
                .select("id")
                .eq("user_id", user.id)
                .is("end_time", null)
                .maybeSingle(),

            // Horas trabajadas hoy
            supabase
                .from("time_entries")
                .select("duration_minutes")
                .eq("user_id", user.id)
                .gte("start_time", startOfDay(new Date()).toISOString())
                .lte("start_time", endOfDay(new Date()).toISOString()),
        ]);

    const todayMinutes =
        todayEntries.data?.reduce(
            (sum: number, e: { duration_minutes: number | null }) =>
                sum + (e.duration_minutes || 0),
            0
        ) || 0;

    return {
        activeProjects: projectsCount.count || 0,
        pendingInvoices: invoicesCount.count || 0,
        activeTimeEntry: !!activeEntry.data,
        todayHours: todayMinutes,
    };
}

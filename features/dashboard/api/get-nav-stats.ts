"use server";

import { getNavStats as getNavStatsFromActions } from "@/lib/actions/stats";
import type { NavStats } from "@/shared/types/sidebar.types";

export async function getNavStats(): Promise<NavStats> {
    return await getNavStatsFromActions();
}

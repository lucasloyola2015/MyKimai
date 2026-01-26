import { createClientComponentClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

export interface RateContext {
  task?: Task | null;
  project?: Project | null;
  client?: Client | null;
  defaultRate?: number | null;
}

/**
 * Resuelve la tarifa aplicable usando el sistema de cascada:
 * tarea > proyecto > cliente > tarifa general
 */
export function resolveRate(context: RateContext): number | null {
  if (context.task?.rate != null) {
    return context.task.rate;
  }

  if (context.project?.rate != null) {
    return context.project.rate;
  }

  if (context.client?.default_rate != null) {
    return context.client.default_rate;
  }

  return context.defaultRate ?? null;
}

/**
 * Obtiene el contexto completo de tarifas para una tarea
 */
export async function getRateContext(
  taskId: string,
  defaultRate?: number | null
): Promise<RateContext> {
  const supabase = createClientComponentClient();

  // Obtener la tarea con su proyecto
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*, projects(*, clients(*))")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    throw new Error("Tarea no encontrada");
  }

  const project = task.projects as Project;
  const client = (project as any).clients as Client;

  return {
    task: task as Task,
    project,
    client,
    defaultRate,
  };
}

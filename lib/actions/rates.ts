"use server";

import { prisma } from "@/lib/prisma/client";
import { getAuthUser } from "@/lib/auth/server";
import type { tasks, projects, clients } from "@prisma/client";

export interface RateContext {
  task?: tasks | null;
  project?: projects | null;
  client?: clients | null;
  defaultRate?: number | null;
}

/**
 * Obtiene el contexto completo de tarifas para una tarea usando Prisma
 * Esta es una Server Action que debe ser llamada desde componentes del cliente
 */
export async function getRateContext(
  taskId: string,
  defaultRate?: number | null
): Promise<RateContext> {
  const user = await getAuthUser();

  // Obtener la tarea con su proyecto y cliente usando Prisma
  const task = await prisma.tasks.findUnique({
    where: { id: taskId },
    include: {
      projects: {
        include: {
          clients: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error("Tarea no encontrada");
  }

  // Verificar que el usuario tenga acceso a esta tarea
  if (task.projects.clients.user_id !== user.id) {
    throw new Error("No tienes acceso a esta tarea");
  }

  return {
    task,
    project: task.projects,
    client: task.projects.clients,
    defaultRate,
  };
}

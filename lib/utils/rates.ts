import type { tasks, projects, clients } from "@/lib/generated/prisma";

export interface RateContext {
  task?: tasks | null;
  project?: projects | null;
  client?: clients | null;
  defaultRate?: number | null;
}

/**
 * Convierte un valor Decimal de Prisma a number
 */
function decimalToNumber(value: any): number | null {
  if (value == null) return null;
  // Prisma Decimal tiene método toNumber()
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value);
}

/**
 * Resuelve la tarifa aplicable usando el sistema de cascada:
 * tarea > proyecto > cliente > tarifa general
 * Esta es una función pura que puede ejecutarse en el cliente
 */
export function resolveRate(context: RateContext): number | null {
  if (context.task?.rate != null) {
    return decimalToNumber(context.task.rate);
  }

  if (context.project?.rate != null) {
    return decimalToNumber(context.project.rate);
  }

  if (context.client?.default_rate != null) {
    return decimalToNumber(context.client.default_rate);
  }

  return context.defaultRate ?? null;
}

// Re-exportar getRateContext desde lib/actions/rates
export { getRateContext, type RateContext as RateContextType } from "@/lib/actions/rates";

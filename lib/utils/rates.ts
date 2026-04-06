import type { tasks, projects, clients } from "@prisma/client";

export type RateSource = "Tarea" | "Proyecto" | "Cliente" | "Usuario" | null;

export interface RateContext {
  task?: tasks | null;
  project?: projects | null;
  client?: clients | null;
  defaultRate?: number | null;
}

export interface RateResult {
  rate: number | null;
  source: RateSource;
}

/**
 * Convierte un valor Decimal de Prisma a number
 */
function decimalToNumber(value: any): number | null {
  if (value == null) return null;
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value);
}

/**
 * SSOT: Resuelve la tarifa aplicable usando el sistema de cascada:
 * tarea > proyecto > cliente > tarifa general
 * Retorna tanto la tarifa como su origen.
 */
export function resolveRate(context: RateContext): RateResult {
  if (context.task?.rate != null) {
    return { rate: decimalToNumber(context.task.rate), source: "Tarea" };
  }

  if (context.project?.rate != null) {
    return { rate: decimalToNumber(context.project.rate), source: "Proyecto" };
  }

  if (context.client?.default_rate != null) {
    return { rate: decimalToNumber(context.client.default_rate), source: "Cliente" };
  }

  if (context.defaultRate != null) {
    return { rate: context.defaultRate, source: "Usuario" };
  }

  return { rate: null, source: null };
}

// Re-exportar getRateContext desde lib/actions/rates
export { getRateContext, type RateContext as RateContextType } from "@/lib/actions/rates";

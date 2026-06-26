import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

/**
 * Convierte un ZodError en un mensaje legible para devolver al cliente.
 * Helper compartido por las Server Actions que validan input con zod.
 */
export function zodErrorMessage(err: ZodError): string {
    return err.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ");
}

/**
 * Convierte un error de una Server Action en un mensaje SEGURO para el cliente,
 * logueando el detalle crudo solo en el servidor. Evita filtrar internals de
 * Prisma/Postgres (nombres de constraints, columnas, SQL) a la UI, y mapea los
 * errores conocidos de Prisma a mensajes de usuario.
 */
export function safeActionError(
    error: unknown,
    fallback = "Ocurrió un error. Intentá de nuevo."
): string {
    console.error("[action error]", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002":
                return "Ya existe un registro con esos datos (duplicado).";
            case "P2025":
                return "El registro no existe o ya fue eliminado.";
            case "P2003":
                return "No se puede completar: hay registros relacionados que lo impiden.";
            default:
                return fallback;
        }
    }
    return fallback;
}

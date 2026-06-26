import { ZodError } from "zod";

/**
 * Convierte un ZodError en un mensaje legible para devolver al cliente.
 * Helper compartido por las Server Actions que validan input con zod.
 */
export function zodErrorMessage(err: ZodError): string {
    return err.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ");
}

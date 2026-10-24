/**
 * Helpers puros de gastos extra de proyecto, compartidos por la creación de la
 * factura (server) y su preview (cliente) para que ambos generen la misma línea.
 */

/**
 * Convierte el monto de un gasto a la moneda de la factura. `usdRate` = ARS por
 * USD. Misma moneda → sin conversión.
 */
export function convertExpenseAmount(
    amount: number,
    from: string,
    to: string,
    usdRate: number
): number {
    if (from === to) return Number(amount.toFixed(2));
    if (!(usdRate > 0)) throw new Error("Falta el tipo de cambio para convertir el gasto.");
    if (from === "ARS" && to === "USD") return Number((amount / usdRate).toFixed(2));
    if (from === "USD" && to === "ARS") return Number((amount * usdRate).toFixed(2));
    throw new Error(`No se puede convertir un gasto de ${from} a ${to}.`);
}

/**
 * dd/MM/yyyy de una columna DATE. Prisma la trae como medianoche UTC: formatear
 * con la zona local la correría un día en Argentina (UTC-3).
 */
export function formatExpenseDate(date: Date | string): string {
    const [y, m, d] = new Date(date).toISOString().slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
}

/** Texto de la línea de la factura: proyecto, qué se compró y cuándo. */
export function buildExpenseDescription(expense: {
    description: string;
    expense_date: Date | string;
    projectName?: string | null;
}): string {
    const project = expense.projectName ? ` — ${expense.projectName}` : "";
    return `Gasto${project}: ${expense.description.trim()} (${formatExpenseDate(expense.expense_date)})`;
}

/** Nombre de archivo apto para una key de Storage (sin acentos ni espacios). */
export function safeStorageFileName(fileName: string): string {
    return (
        fileName
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]+/g, "_")
            .slice(-120) || "archivo"
    );
}

/** Key del comprobante en el bucket: una carpeta por owner y por gasto. */
export function expenseStoragePath(ownerId: string, expenseId: string, uniqueId: string, fileName: string): string {
    return `${ownerId}/${expenseId}/${uniqueId}-${safeStorageFileName(fileName)}`;
}

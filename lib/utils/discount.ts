/**
 * Descripción de la línea de descuento de una factura.
 *
 * SSOT compartida entre el preview (cliente) y la persistencia (Server Action),
 * para que la línea que se ve antes de emitir sea exactamente la que queda en la
 * factura. Incluye SIEMPRE el motivo cuando el usuario lo cargó.
 */
export function buildDiscountDescription(
    percent: number,
    reason?: string | null
): string {
    const pct = Number(percent);
    const pctLabel = Number.isFinite(pct)
        ? // Sin decimales si es entero (10% en vez de 10.00%)
          (Math.round(pct * 100) / 100).toString()
        : "0";
    const motivo = (reason ?? "").trim();
    return motivo
        ? `Descuento ${pctLabel}% — ${motivo}`
        : `Descuento ${pctLabel}%`;
}

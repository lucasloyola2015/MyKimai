/**
 * Configuración fiscal por defecto (AFIP / punto de venta).
 * En producción se usa punto de venta 3.
 * Override con variable de entorno PUNTO_VENTA si hace falta.
 */
export const PUNTO_VENTA_DEFAULT = Number(process.env.PUNTO_VENTA) || 3;

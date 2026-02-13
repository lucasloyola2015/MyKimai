"use server";

const FALLBACK_RATE = 1050;
const EXCHANGE_SOURCE_LABEL = "Dólar Oficial (venta)";

export interface UsdExchangeInfo {
    rate: number;
    /** Fecha de actualización de la cotización (ISO string o null) */
    updatedAt: string | null;
    /** Referencia legible: ej. "Dólar Oficial (venta)" */
    source: string;
}

/**
 * Obtiene el tipo de cambio del Dólar Oficial Venta desde dolarapi.com,
 * con metadata para mostrar referencia al usuario.
 */
export async function getUsdExchangeRate(): Promise<number> {
    const info = await getUsdExchangeRateInfo();
    return info.rate;
}

/**
 * Obtiene tipo de cambio y metadata (origen, fecha) para mostrarlo en UI.
 */
export async function getUsdExchangeRateInfo(): Promise<UsdExchangeInfo> {
    try {
        const response = await fetch("https://dolarapi.com/v1/dolares/oficial", {
            next: { revalidate: 3600 }
        });

        if (!response.ok) throw new Error("Error al obtener tipo de cambio");

        const data = await response.json();
        const venta = Number(data.venta);
        const rate = Number.isFinite(venta) ? venta : FALLBACK_RATE;
        const updatedAt =
            typeof data.fechaActualizacion === "string"
                ? data.fechaActualizacion
                : null;

        return {
            rate,
            updatedAt,
            source: EXCHANGE_SOURCE_LABEL,
        };
    } catch (error) {
        console.error("Error fetching exchange rate:", error);
        return {
            rate: FALLBACK_RATE,
            updatedAt: null,
            source: EXCHANGE_SOURCE_LABEL,
        };
    }
}

"use server";

/**
 * Obtiene el tipo de cambio del Dólar Oficial Venta desde dolarapi.com
 */
export async function getUsdExchangeRate(): Promise<number> {
    try {
        const response = await fetch("https://dolarapi.com/v1/dolares/oficial", {
            next: { revalidate: 3600 } // Revalidar cada hora
        });

        if (!response.ok) throw new Error("Error al obtener tipo de cambio");

        const data = await response.json();
        return Number(data.venta);
    } catch (error) {
        console.error("Error fetching exchange rate:", error);
        // Fallback en caso de error: 1050 (valor aproximado razonable Feb 2026) o lanzar error
        return 1050;
    }
}

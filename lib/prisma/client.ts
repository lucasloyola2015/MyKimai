import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

import { Pool } from "pg";

function createPrisma() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error("DATABASE_URL is required for Prisma");
    }

    try {
        // En Vercel/Producción, forzamos SSL no verificado para evitar el error de cadena de certificados
        const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

        // Limpiamos la URL de parámetros que puedan entrar en conflicto con la configuración del Pool
        let finalConnectionString = connectionString;
        if (isProduction) {
            try {
                const url = new URL(connectionString);
                url.searchParams.delete('sslmode');
                finalConnectionString = url.toString();
            } catch (e) {
                // Si falla el parseo (ej: postgresql://), usamos la original
            }
        }

        const pool = new Pool({
            connectionString: finalConnectionString,
            ssl: isProduction ? { rejectUnauthorized: false } : undefined,
            max: 1, // Optimización para Serverless
            connectionTimeoutMillis: 5000,
        });

        const adapter = new PrismaPg(pool);

        const client = new PrismaClient({
            adapter,
            log: isProduction ? ["error"] : ["query", "error", "warn"],
        });

        return client;
    } catch (error) {
        console.error("FATAL PRISMA ADAPTER INITIALIZATION:", error);
        throw error;
    }
}

export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

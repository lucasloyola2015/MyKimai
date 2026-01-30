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
        // Configuramos el pool de pg explícitamente para manejar el SSL de Supabase/Vercel
        const pool = new Pool({
            connectionString,
            ssl: process.env.NODE_ENV === "production"
                ? { rejectUnauthorized: false }
                : undefined,
        });

        const adapter = new PrismaPg(pool);

        const client = new PrismaClient({
            adapter,
            log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
        });

        return client;
    } catch (error) {
        console.error("DEBUG PRISMA CLIENT CREATION ERROR:", error);
        throw error;
    }
}

export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

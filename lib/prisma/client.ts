import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrisma() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error("DATABASE_URL is required for Prisma");
    }

    try {
        const adapter = new PrismaPg({ connectionString });

        const client = new PrismaClient({
            adapter,
            log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
        });

        return client;
    } catch (error) {
        throw error;
    }
}

export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

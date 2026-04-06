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

        // Extensión: convierte Prisma Decimal a number en todos los resultados
        // Evita warnings de Next.js "Decimal objects are not supported" en Client Components
        const extended = client.$extends({
            result: {
                time_entries: {
                    amount: { compute: (entry) => entry.amount != null ? Number(entry.amount) : null },
                    rate_applied: { compute: (entry) => entry.rate_applied != null ? Number(entry.rate_applied) : null },
                    usd_exchange_rate: { compute: (entry) => entry.usd_exchange_rate != null ? Number(entry.usd_exchange_rate) : null },
                },
                tasks: {
                    rate: { compute: (task) => task.rate != null ? Number(task.rate) : null },
                },
                projects: {
                    rate: { compute: (project) => project.rate != null ? Number(project.rate) : null },
                },
                clients: {
                    default_rate: { compute: (client) => client.default_rate != null ? Number(client.default_rate) : null },
                },
                invoices: {
                    subtotal: { compute: (inv) => Number(inv.subtotal) },
                    tax_rate: { compute: (inv) => inv.tax_rate != null ? Number(inv.tax_rate) : null },
                    tax_amount: { compute: (inv) => inv.tax_amount != null ? Number(inv.tax_amount) : null },
                    total_amount: { compute: (inv) => Number(inv.total_amount) },
                },
                invoice_items: {
                    quantity: { compute: (item) => Number(item.quantity) },
                    rate: { compute: (item) => Number(item.rate) },
                    amount: { compute: (item) => Number(item.amount) },
                },
                hour_packages: {
                    hours: { compute: (pkg) => Number(pkg.hours) },
                    hours_used: { compute: (pkg) => Number(pkg.hours_used) },
                    price: { compute: (pkg) => Number(pkg.price) },
                },
                payments: {
                    amount: { compute: (p) => Number(p.amount) },
                },
            },
        });

        return extended as unknown as PrismaClient;
    } catch (error) {
        console.error("FATAL PRISMA ADAPTER INITIALIZATION:", error);
        throw error;
    }
}

export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

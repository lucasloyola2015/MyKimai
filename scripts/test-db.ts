import * as dotenv from "dotenv";
dotenv.config();
import { prisma } from "../lib/prisma/client";

async function main() {
    try {
        console.log("Attempting to add missing updated_at column...");
        await prisma.$executeRawUnsafe(`
      ALTER TABLE public.time_entries 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ(6) DEFAULT NOW()
    `);
        console.log("Column updated_at created (if not existed).");

        const finalCols: any = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'time_entries' AND table_schema = 'public';
    `);
        console.log("FINAL COLUMNS:", finalCols.map((c: any) => c.column_name).sort());

        const allTimeEntryTriggers: any = await prisma.$queryRawUnsafe(`
      SELECT tgname as trigger_name, pg_get_triggerdef(oid) as def 
      FROM pg_trigger 
      WHERE tgrelid = 'public.time_entries'::regclass
    `);
        console.log("All time_entries Triggers:", JSON.stringify(allTimeEntryTriggers, null, 2));

        const testUpdate = await prisma.$executeRawUnsafe(
            `UPDATE public.time_entries 
       SET usd_exchange_rate = 1200, 
           updated_at = NOW() 
       WHERE id = (SELECT id FROM public.time_entries LIMIT 1)`
        );
        console.log("Update test result with updated_at (Raw SQL):", testUpdate);

        // Test with Prisma Client
        const firstEntry = await prisma.time_entries.findFirst();
        if (firstEntry) {
            console.log("Attempting Prisma update for ID:", firstEntry.id);
            const updated = await (prisma.time_entries as any).update({
                where: { id: firstEntry.id },
                data: { usd_exchange_rate: 1100 }
            });
            console.log("Prisma update successful:", updated.usd_exchange_rate);
        }
    } catch (error) {
        console.error("DB Test failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();

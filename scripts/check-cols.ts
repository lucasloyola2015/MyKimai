import { prisma } from "../lib/prisma/client";

async function check() {
    const cols: any = await prisma.$queryRawUnsafe(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'time_entries' AND table_schema = 'public'
  `);
    console.log("Columns:", cols.map((c: any) => c.column_name).sort());
    await prisma.$disconnect();
}

check();

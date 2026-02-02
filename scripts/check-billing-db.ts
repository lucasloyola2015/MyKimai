import * as dotenv from "dotenv";
dotenv.config();
import { prisma } from "../lib/prisma/client";

async function main() {
  try {
    console.log("Checking invoices table...");
    const invoiceCols: any = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'invoices' AND table_schema = 'public'
    `);
    console.log("Invoices columns:", invoiceCols.map((c: any) => c.column_name).sort());

    console.log("\nChecking trigger definitions for invoices...");
    const invoiceTriggers: any = await prisma.$queryRawUnsafe(`
      SELECT tgname, pg_get_triggerdef(oid) as def 
      FROM pg_trigger 
      WHERE tgrelid = 'public.invoices'::regclass
    `);
    console.log("Invoice Trigger Defs:", JSON.stringify(invoiceTriggers, null, 2));

    const invoiceFunc: any = await prisma.$queryRawUnsafe(`
      SELECT routine_name, routine_definition 
      FROM information_schema.routines 
      WHERE routine_name IN ('generate_invoice_number', 'update_updated_at_column')
    `);
    console.log("Functions:", JSON.stringify(invoiceFunc, null, 2));

    console.log("\nChecking invoice_items table...");
    const itemCols: any = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'invoice_items' AND table_schema = 'public'
    `);
    console.log("Invoice items columns:", itemCols.map((c: any) => c.column_name).sort());

    console.log("\nChecking triggers for both...");
    const triggers: any = await prisma.$queryRawUnsafe(`
      SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE event_object_table IN ('invoices', 'invoice_items')
    `);
    console.log("Triggers:", JSON.stringify(triggers, null, 2));

  } catch (error) {
    console.error("Diagnostic failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

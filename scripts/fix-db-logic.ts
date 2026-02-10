import { prisma } from "../lib/prisma/client";

async function migrate() {
    console.log("Updating database functions and triggers...");

    try {
        // 1. Update calculate_time_entry_duration
        console.log("Updating calculate_time_entry_duration...");
        await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
      RETURNS TRIGGER AS $$
      DECLARE
          break_minutes INTEGER;
      BEGIN
          IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
              -- 1. Calculate TOTAL duration
              NEW.duration_total := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
              
              -- 2. Calculate sum of BREAKS
              SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::INTEGER, 0)
              INTO break_minutes
              FROM public.time_entry_breaks
              WHERE time_entry_id = NEW.id AND end_time IS NOT NULL;
              
              -- 3. Calculate NET duration
              NEW.duration_neto := NEW.duration_total - break_minutes;
              
              -- 4. Calculate amount based on duration_neto
              IF NEW.rate_applied IS NOT NULL AND NEW.duration_neto > 0 THEN
                  NEW.amount := (NEW.duration_neto / 60.0) * NEW.rate_applied;
              END IF;
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

        // 2. Trigger function for breaks to force parent update
        console.log("Creating break trigger function...");
        await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION update_entry_duration_on_break()
      RETURNS TRIGGER AS $$
      BEGIN
          UPDATE public.time_entries
          SET updated_at = NOW()
          WHERE id = COALESCE(NEW.time_entry_id, OLD.time_entry_id);
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

        // 3. Create triggers
        console.log("Linking triggers...");
        await prisma.$executeRawUnsafe(`
      -- Trigger para time_entries
      DROP TRIGGER IF EXISTS trigger_calculate_time_entry_duration ON public.time_entries;
      CREATE TRIGGER trigger_calculate_time_entry_duration
      BEFORE INSERT OR UPDATE ON public.time_entries
      FOR EACH ROW EXECUTE FUNCTION calculate_time_entry_duration();

      -- Trigger para time_entry_breaks
      DROP TRIGGER IF EXISTS trigger_update_entry_duration_on_break ON public.time_entry_breaks;
      CREATE TRIGGER trigger_update_entry_duration_on_break
      AFTER INSERT OR UPDATE OR DELETE ON public.time_entry_breaks
      FOR EACH ROW EXECUTE FUNCTION update_entry_duration_on_break();
    `);

        // 4. Initial sync of all records
        console.log("Synchronizing all records...");
        await prisma.$executeRawUnsafe(`
      UPDATE public.time_entries SET updated_at = NOW();
    `);

        console.log("Migration successful!");
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();

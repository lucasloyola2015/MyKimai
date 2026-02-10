import { prisma } from "../lib/prisma/client";

async function migrate() {
    console.log("Starting migration...");

    try {
        // 1. Rename column and add new column
        console.log("Renaming duration_minutes to duration_total and adding duration_neto...");
        await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='time_entries' AND column_name='duration_minutes') THEN
          ALTER TABLE public.time_entries RENAME COLUMN duration_minutes TO duration_total;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='time_entries' AND column_name='duration_neto') THEN
          ALTER TABLE public.time_entries ADD COLUMN duration_neto INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);

        // 2. Initialize duration_neto
        console.log("Initializing duration_neto for existing records...");
        await prisma.$executeRawUnsafe(`
      UPDATE public.time_entries te
      SET duration_neto = COALESCE(te.duration_total, 0) - COALESCE((
        SELECT SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::INTEGER
        FROM public.time_entry_breaks b
        WHERE b.time_entry_id = te.id AND b.end_time IS NOT NULL
      ), 0);
    `);

        // 3. Update the calculate_time_entry_duration function to handle neto
        console.log("Updating database function calculate_time_entry_duration...");
        await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
      RETURNS TRIGGER AS $$
      DECLARE
          break_minutes INTEGER;
      BEGIN
          IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
              NEW.duration_total := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
              
              -- Calculate breaks
              SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::INTEGER, 0)
              INTO break_minutes
              FROM public.time_entry_breaks
              WHERE time_entry_id = NEW.id AND end_time IS NOT NULL;
              
              NEW.duration_neto := NEW.duration_total - break_minutes;
              
              -- Calculate amount based on duration_neto
              IF NEW.rate_applied IS NOT NULL AND NEW.duration_neto > 0 THEN
                  NEW.amount := (NEW.duration_neto / 60.0) * NEW.rate_applied;
              END IF;
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

        // 4. Create trigger function for breaks
        console.log("Creating break trigger function...");
        await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION update_entry_duration_on_break()
      RETURNS TRIGGER AS $$
      BEGIN
          -- Update the parent time_entry
          UPDATE public.time_entries
          SET updated_at = NOW() -- This will trigger calculate_time_entry_duration
          WHERE id = COALESCE(NEW.time_entry_id, OLD.time_entry_id);
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

        // 5. Create trigger on time_entry_breaks
        console.log("Creating trigger on time_entry_breaks...");
        await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS trigger_update_entry_duration_on_break ON public.time_entry_breaks;
      CREATE TRIGGER trigger_update_entry_duration_on_break
      AFTER INSERT OR UPDATE OR DELETE ON public.time_entry_breaks
      FOR EACH ROW EXECUTE FUNCTION update_entry_duration_on_break();
    `);

        console.log("Migration completed successfully!");
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();

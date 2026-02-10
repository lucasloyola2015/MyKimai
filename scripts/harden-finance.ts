import { prisma } from "../lib/prisma/client";

async function migrate() {
    console.log("🛠️ Centralizando lógica financiera en la Base de Datos...");

    try {
        // 1. Crear función de cascada de precios
        console.log("Creating get_cascade_rate function...");
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION get_cascade_rate(task_uuid UUID)
            RETURNS DECIMAL AS $$
            DECLARE
                rate DECIMAL;
            BEGIN
                -- 1. Intentar tarifa de TAREA
                SELECT t.rate INTO rate FROM public.tasks t WHERE t.id = task_uuid;
                IF rate IS NOT NULL AND rate > 0 THEN RETURN rate; END IF;

                -- 2. Intentar tarifa de PROYECTO
                SELECT p.rate INTO rate 
                FROM public.tasks t 
                JOIN public.projects p ON t.project_id = p.id 
                WHERE t.id = task_uuid;
                IF rate IS NOT NULL AND rate > 0 THEN RETURN rate; END IF;

                -- 3. Intentar tarifa de CLIENTE
                SELECT c.default_rate INTO rate 
                FROM public.tasks t 
                JOIN public.projects p ON t.project_id = p.id 
                JOIN public.clients c ON p.client_id = c.id 
                WHERE t.id = task_uuid;
                
                RETURN COALESCE(rate, 0);
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 2. Actualizar función principal de cálculo
        console.log("Updating calculate_time_entry_duration with cascade logic...");
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
            RETURNS TRIGGER AS $$
            DECLARE
                break_minutes INTEGER;
            BEGIN
                -- Solo calculamos si hay hora de inicio y fin (registros cerrados)
                -- O si es una actualización de un registro que ya tenía fin
                IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
                    -- 1. Calcular duración TOTAL (bruta)
                    NEW.duration_total := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
                    
                    -- 2. Calcular suma de PAUSAS
                    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::INTEGER, 0)
                    INTO break_minutes
                    FROM public.time_entry_breaks
                    WHERE time_entry_id = NEW.id AND end_time IS NOT NULL;
                    
                    -- 3. Calcular duración NETA
                    NEW.duration_neto := NEW.duration_total - break_minutes;
                    
                    -- 4. Lógica de PRECIO EN CASCADA e INMUTABILIDAD
                    -- Si no tiene tarifa aplicada aún, la buscamos en cascada (primera vez)
                    IF NEW.rate_applied IS NULL OR NEW.rate_applied = 0 THEN
                        NEW.rate_applied := get_cascade_rate(NEW.task_id);
                    END IF;
                    
                    -- 5. Calcular monto final basado en duración neta y tarifa persistida
                    -- Esto asegura que si la tarifa cambia en el futuro, este registro no se afecte
                    -- a menos que se fuerce un recalculo manual borrando rate_applied.
                    IF NEW.rate_applied IS NOT NULL AND NEW.duration_neto > 0 THEN
                        NEW.amount := (NEW.duration_neto / 60.0) * NEW.rate_applied;
                    ELSE
                        NEW.amount := 0;
                    END IF;
                ELSE
                    -- Si el registro está activo, reseteamos montos persistidos para evitar basura
                    -- El frontend se encarga de la visualización dinámica del activo.
                    NEW.duration_total := NULL;
                    NEW.duration_neto := 0;
                    NEW.amount := 0;
                END IF;
                
                NEW.updated_at := NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 3. Re-vincular triggers
        console.log("Ensuring triggers are linked...");
        await prisma.$executeRawUnsafe(`
            DROP TRIGGER IF EXISTS trigger_calculate_time_entry_duration ON public.time_entries;
            CREATE TRIGGER trigger_calculate_time_entry_duration
            BEFORE INSERT OR UPDATE ON public.time_entries
            FOR EACH ROW EXECUTE FUNCTION calculate_time_entry_duration();
        `);

        // 4. Sincronización inicial para aplicar la nueva lógica a todo lo existente
        console.log("Applying cascade logic to all existing entries...");
        await prisma.$executeRawUnsafe(`
            UPDATE public.time_entries 
            SET updated_at = NOW() 
            WHERE end_time IS NOT NULL;
        `);

        console.log("✅ Blindaje financiero completado en la base de datos.");
    } catch (error) {
        console.error("❌ Falló la migración financiera:", error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();

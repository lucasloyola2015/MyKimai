-- =============================================================================
-- 2026-06-26 — Triggers de cálculo de duración/monto (VERSIONADOS + corregidos)
-- =============================================================================
-- Análisis de diseño (ANALISIS_DISENO_2026-06.md):
--   DATA-2: los triggers de cálculo NO estaban en supabase/migrations/ (vivían
--           en scripts/*.ts y .sql sueltos con versiones divergentes). Esta es
--           la definición autoritativa y versionada. Un re-deploy desde cero
--           ahora reconstruye la lógica financiera.
--   TIME-1: las pausas se sumaban sin recortar al intervalo del entry ni fusionar
--           solapamientos → duration_neto podía quedar negativo o inflado. Ahora
--           cada pausa se CLAMPEA a [start_time, end_time] y se FUSIONAN los
--           intervalos solapados antes de sumar (gaps-and-islands).
--   DATA: faltaba la rama ELSE del monto → amount quedaba OBSOLETO cuando
--         billable=true pero rate_applied IS NULL o duration_neto <= 0. Ahora
--         se fuerza amount := 0 en ese caso (sin montos fantasma).
--
-- Unidad: minutos enteros. Idempotente (CREATE OR REPLACE + DROP/CREATE TRIGGER).
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
RETURNS TRIGGER AS $$
DECLARE
    break_minutes INTEGER;
BEGIN
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        -- 1. Duración TOTAL (la asignación a columna INTEGER redondea).
        NEW.duration_total := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;

        -- 2. Suma de PAUSAS con CLAMP al intervalo del entry + MERGE de
        --    solapamientos (gaps-and-islands), para no sobre-restar.
        WITH clamped AS (
            SELECT
                GREATEST(b.start_time, NEW.start_time) AS s,
                LEAST(b.end_time, NEW.end_time)        AS e
            FROM public.time_entry_breaks b
            WHERE b.time_entry_id = NEW.id
              AND b.end_time IS NOT NULL
              AND b.start_time < NEW.end_time      -- descarta pausas fuera de rango
              AND b.end_time   > NEW.start_time
        ),
        ordered AS (
            SELECT s, e,
                   MAX(e) OVER (
                       ORDER BY s, e
                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                   ) AS prev_max_e
            FROM clamped
        ),
        islands AS (
            SELECT s, e,
                   SUM(CASE WHEN prev_max_e IS NULL OR s > prev_max_e THEN 1 ELSE 0 END)
                       OVER (ORDER BY s, e) AS grp
            FROM ordered
        ),
        merged AS (
            SELECT MIN(s) AS s, MAX(e) AS e
            FROM islands
            GROUP BY grp
        )
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (e - s)) / 60), 0)::INTEGER
          INTO break_minutes
          FROM merged;

        -- 3. Duración NETA (nunca negativa).
        NEW.duration_neto := GREATEST(NEW.duration_total - break_minutes, 0);

        -- 4. Monto, con blindaje de facturabilidad y rama ELSE (sin obsoletos).
        IF NEW.billable = false THEN
            NEW.amount := 0;
            NEW.rate_applied := 0;
        ELSIF NEW.rate_applied IS NOT NULL AND NEW.duration_neto > 0 THEN
            NEW.amount := ROUND((NEW.duration_neto / 60.0) * NEW.rate_applied, 2);
        ELSE
            -- billable=true pero sin tarifa o neto<=0: no dejar amount viejo.
            NEW.amount := 0;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger que re-dispara el cálculo del entry padre cuando cambian sus pausas.
CREATE OR REPLACE FUNCTION update_entry_duration_on_break()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.time_entries
       SET updated_at = NOW()
     WHERE id = COALESCE(NEW.time_entry_id, OLD.time_entry_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_time_entry_duration ON public.time_entries;
CREATE TRIGGER trigger_calculate_time_entry_duration
    BEFORE INSERT OR UPDATE ON public.time_entries
    FOR EACH ROW EXECUTE FUNCTION calculate_time_entry_duration();

DROP TRIGGER IF EXISTS trigger_update_entry_duration_on_break ON public.time_entry_breaks;
CREATE TRIGGER trigger_update_entry_duration_on_break
    AFTER INSERT OR UPDATE OR DELETE ON public.time_entry_breaks
    FOR EACH ROW EXECUTE FUNCTION update_entry_duration_on_break();

-- Re-sincronizar todas las filas existentes (recalcula neto/amount con la
-- lógica corregida). Seguro: solo toca filas con end_time.
UPDATE public.time_entries SET updated_at = NOW() WHERE end_time IS NOT NULL;

-- Verificación:
--   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trigger_%';

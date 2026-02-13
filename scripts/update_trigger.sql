
CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
RETURNS TRIGGER AS $$
DECLARE
    break_minutes INTEGER;
BEGIN
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        -- 1. Calcular duración TOTAL
        NEW.duration_total := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
        
        -- 2. Calcular suma de PAUSAS
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::INTEGER, 0)
        INTO break_minutes
        FROM public.time_entry_breaks
        WHERE time_entry_id = NEW.id AND end_time IS NOT NULL;
        
        -- 3. Calcular duración NETA
        NEW.duration_neto := NEW.duration_total - break_minutes;
        
        -- 4. Calcular monto basado en duración neta y BLINDAJE DE FACTURABILIDAD
        -- Si billable es false, el monto es siempre 0. (Blindaje SSOT)
        IF NEW.billable = false THEN
            NEW.amount := 0;
            NEW.rate_applied := 0;
        ELSIF NEW.rate_applied IS NOT NULL AND NEW.duration_neto > 0 THEN
            NEW.amount := (NEW.duration_neto / 60.0) * NEW.rate_applied;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

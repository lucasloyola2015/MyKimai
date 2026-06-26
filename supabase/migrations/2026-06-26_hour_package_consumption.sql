-- =============================================================================
-- 2026-06-26 — Consumo real de paquetes de horas (§4.3 IMPROVEMENT_PLAN)
-- =============================================================================
-- Antes hour_packages.hours_used nunca se descontaba → el saldo de prepagos era
-- ficticio. Ahora:
--   1) time_entries.consumed_from_package_id linkea cada entrada al paquete que
--      consumió (auto al frenar por FIFO de scope, o manual). ON DELETE SET NULL:
--      borrar un paquete desvincula las entradas, no las borra.
--   2) hours_used es DERIVADO por trigger = SUM(duration_neto/60) de las entradas
--      linkeadas → siempre consistente ante ediciones/borrados de duración/pausas.
--   3) Se relaja el CHECK para permitir hours_used > hours (la entrada que cruza
--      el límite del paquete lo consume entera; el resto va a facturación normal).
--
-- Idempotente. SQL Editor en transacción.
-- =============================================================================

-- 1) Columna de link + FK + índice
ALTER TABLE public.time_entries
    ADD COLUMN IF NOT EXISTS consumed_from_package_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_consumed_from_package_id_fkey'
    ) THEN
        ALTER TABLE public.time_entries
            ADD CONSTRAINT time_entries_consumed_from_package_id_fkey
            FOREIGN KEY (consumed_from_package_id)
            REFERENCES public.hour_packages(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_time_entries_consumed_pkg
    ON public.time_entries (consumed_from_package_id);

-- 2) Relajar el CHECK de hour_packages (permitir hours_used > hours)
ALTER TABLE public.hour_packages DROP CONSTRAINT IF EXISTS chk_hour_packages_hours;
ALTER TABLE public.hour_packages ADD CONSTRAINT chk_hour_packages_hours
    CHECK (hours >= 0 AND hours_used >= 0) NOT VALID;

-- 3) hours_used derivado por trigger
CREATE OR REPLACE FUNCTION public.recompute_hour_package_usage(p_pkg uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_pkg IS NULL THEN RETURN; END IF;
    UPDATE public.hour_packages
       SET hours_used = COALESCE((
               SELECT SUM(duration_neto)::numeric / 60.0
               FROM public.time_entries
               WHERE consumed_from_package_id = p_pkg
                 AND duration_neto IS NOT NULL
           ), 0),
           updated_at = NOW()
     WHERE id = p_pkg;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_hour_package_usage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recompute_hour_package_usage(OLD.consumed_from_package_id);
    ELSIF TG_OP = 'INSERT' THEN
        PERFORM public.recompute_hour_package_usage(NEW.consumed_from_package_id);
    ELSE  -- UPDATE: recalcular el paquete viejo y, si cambió, el nuevo.
        PERFORM public.recompute_hour_package_usage(OLD.consumed_from_package_id);
        IF NEW.consumed_from_package_id IS DISTINCT FROM OLD.consumed_from_package_id THEN
            PERFORM public.recompute_hour_package_usage(NEW.consumed_from_package_id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_hour_package_usage ON public.time_entries;
CREATE TRIGGER trigger_sync_hour_package_usage
    AFTER INSERT OR UPDATE OR DELETE ON public.time_entries
    FOR EACH ROW EXECUTE FUNCTION public.sync_hour_package_usage();

-- Re-sincronizar saldos de todos los paquetes que ya tengan entradas linkeadas
-- (no-op si todavía no hay links).
UPDATE public.hour_packages hp
   SET hours_used = COALESCE((
           SELECT SUM(te.duration_neto)::numeric / 60.0
           FROM public.time_entries te
           WHERE te.consumed_from_package_id = hp.id
             AND te.duration_neto IS NOT NULL
       ), 0);

-- Verificación:
--   SELECT id, hours, hours_used FROM public.hour_packages;
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trigger_sync_hour_package_usage';

-- =============================================================================
-- 2026-06-26 — Índices únicos parciales: 1 timer/pausa activa por entidad
-- =============================================================================
-- Análisis de diseño §6 (TIME — concurrencia): startTimeEntry/pauseTimeEntry
-- hacen findFirst + create sin atomicidad → dos requests casi simultáneos del
-- MISMO usuario pueden crear dos timers (o dos pausas) activos. Estos índices
-- únicos parciales lo vuelven IMPOSIBLE a nivel DB.
--
-- Se crean dentro de un DO block que detecta duplicados preexistentes y, si los
-- hay, NO falla la migración (emite NOTICE para resolverlos a mano). Idempotente.
-- SQL Editor en transacción → CREATE INDEX normal (sin CONCURRENTLY).
-- =============================================================================

-- 1 timer activo (end_time IS NULL) por usuario.
DO $$
DECLARE dup int;
BEGIN
    SELECT COUNT(*) INTO dup FROM (
        SELECT user_id FROM public.time_entries
         WHERE end_time IS NULL
         GROUP BY user_id HAVING COUNT(*) > 1
    ) d;

    IF dup > 0 THEN
        RAISE NOTICE 'uniq_active_timer_per_user NO creado: % usuario(s) con >1 timer activo. Cerrá los duplicados y re-corré esta migración.', dup;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_timer_per_user
            ON public.time_entries (user_id) WHERE end_time IS NULL;
    END IF;
END $$;

-- 1 pausa activa (end_time IS NULL) por time_entry.
DO $$
DECLARE dup int;
BEGIN
    SELECT COUNT(*) INTO dup FROM (
        SELECT time_entry_id FROM public.time_entry_breaks
         WHERE end_time IS NULL
         GROUP BY time_entry_id HAVING COUNT(*) > 1
    ) d;

    IF dup > 0 THEN
        RAISE NOTICE 'uniq_active_break_per_entry NO creado: % entry(s) con >1 pausa activa. Cerrá los duplicados y re-corré.', dup;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_break_per_entry
            ON public.time_entry_breaks (time_entry_id) WHERE end_time IS NULL;
    END IF;
END $$;

-- Verificación:
--   SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uniq_active_%';

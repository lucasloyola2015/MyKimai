-- =============================================================================
-- 2026-06-26 — Timers en paralelo (varias tareas/proyectos corriendo a la vez)
-- =============================================================================
-- Feature: permitir múltiples time_entries activos (end_time IS NULL) en paralelo.
-- Reemplaza la invariante "1 timer activo por usuario" (uniq_active_timer_per_user,
-- de la migración 2026-06-26_active_timer_unique_indexes.sql) por "1 timer activo
-- por (usuario, tarea)": se pueden correr N tareas distintas a la vez, pero NO dos
-- timers de la MISMA tarea (guard contra doble-start accidental).
--
-- El índice uniq_active_break_per_entry (1 pausa activa por entry) se MANTIENE.
-- Idempotente.
-- =============================================================================

-- 1) Quitar la restricción de un único timer activo por usuario.
DROP INDEX IF EXISTS public.uniq_active_timer_per_user;

-- 2) Nuevo guard: a lo sumo 1 timer activo por (usuario, tarea).
DO $$
DECLARE dup int;
BEGIN
    SELECT COUNT(*) INTO dup FROM (
        SELECT user_id, task_id FROM public.time_entries
         WHERE end_time IS NULL
         GROUP BY user_id, task_id HAVING COUNT(*) > 1
    ) d;

    IF dup > 0 THEN
        RAISE NOTICE 'uniq_active_timer_per_user_task NO creado: % (user,task) con >1 timer activo. Cerrá los duplicados y re-corré.', dup;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_timer_per_user_task
            ON public.time_entries (user_id, task_id) WHERE end_time IS NULL;
    END IF;
END $$;

-- Verificación:
--   SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uniq_active_%';
--   (debe aparecer uniq_active_timer_per_user_task y uniq_active_break_per_entry,
--    y NO uniq_active_timer_per_user)

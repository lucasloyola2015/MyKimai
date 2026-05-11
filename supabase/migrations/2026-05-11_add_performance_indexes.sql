-- §4.7 IMPROVEMENT_PLAN — Índices de performance
--
-- Aplicar este script en Supabase SQL Editor en producción.
-- Todos los CREATE INDEX usan `IF NOT EXISTS` y `CONCURRENTLY` para
-- evitar locks largos sobre tablas en uso.
--
-- Si una ejecución falla a mitad de un CREATE INDEX CONCURRENTLY,
-- Postgres deja el índice en estado INVALID. Para limpiarlo:
--   DROP INDEX IF EXISTS <nombre_del_indice>;
-- y volver a correr el statement.

-- 1) time_entries: queries de "horas no facturadas"
--    (filtros típicos: is_billed = false AND billable = true)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_time_entries_unbilled
    ON public.time_entries (is_billed, billable);

-- 2) time_entry_breaks: orden de pausas dentro de una entrada
--    (queries típicas: WHERE time_entry_id = ? ORDER BY start_time)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_time_entry_breaks_entry_time
    ON public.time_entry_breaks (time_entry_id, start_time);

-- 3) invoices: listas ordenadas por fecha de creación (dashboards)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_created_at
    ON public.invoices (created_at DESC);

-- Verificación post-ejecución:
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname = 'public' AND indexname IN (
--   'idx_time_entries_unbilled',
--   'idx_time_entry_breaks_entry_time',
--   'idx_invoices_created_at'
-- );

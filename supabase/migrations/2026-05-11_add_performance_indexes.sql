-- §4.7 IMPROVEMENT_PLAN — Índices de performance
--
-- ▸ EJECUTAR en Supabase SQL Editor (Project → SQL Editor → New query).
--
-- Por defecto se crean sin CONCURRENTLY porque el SQL Editor de Supabase
-- envuelve cada query en una transacción implícita, y CONCURRENTLY no
-- puede correr dentro de un transaction block (PostgreSQL error 25001).
--
-- En tablas de esta escala (pocos miles de filas), un CREATE INDEX
-- estándar adquiere un lock ACCESS EXCLUSIVE sobre la tabla por
-- milisegundos — práctica equivalente a sin downtime.
--
-- Si más adelante el volumen crece y querés evitar TODO bloqueo,
-- ejecutá las versiones con CONCURRENTLY desde `psql` directo:
--   psql "$DATABASE_URL" -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS ..."
-- (ver versiones comentadas al final del archivo).

-- 1) time_entries: queries de "horas no facturadas"
--    (filtros típicos: is_billed = false AND billable = true)
CREATE INDEX IF NOT EXISTS idx_time_entries_unbilled
    ON public.time_entries (is_billed, billable);

-- 2) time_entry_breaks: orden de pausas dentro de una entrada
--    (queries típicas: WHERE time_entry_id = ? ORDER BY start_time)
CREATE INDEX IF NOT EXISTS idx_time_entry_breaks_entry_time
    ON public.time_entry_breaks (time_entry_id, start_time);

-- 3) invoices: listas ordenadas por fecha de creación (dashboards)
CREATE INDEX IF NOT EXISTS idx_invoices_created_at
    ON public.invoices (created_at DESC);

-- Verificación post-ejecución (correr aparte):
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname = 'public' AND indexname IN (
--   'idx_time_entries_unbilled',
--   'idx_time_entry_breaks_entry_time',
--   'idx_invoices_created_at'
-- );

-- =============================================================
-- Versión alternativa para producción de alta carga (psql/CLI):
-- =============================================================
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_time_entries_unbilled
--     ON public.time_entries (is_billed, billable);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_time_entry_breaks_entry_time
--     ON public.time_entry_breaks (time_entry_id, start_time);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_created_at
--     ON public.invoices (created_at DESC);

-- =============================================================================
-- 2026-07-06 — Título libre en time_entries (reemplaza a la "tarea" como objeto)
-- =============================================================================
-- Las tareas dejan de usarse desde la UI: al cargar horas se elige Cliente →
-- Proyecto y se escribe un TÍTULO a mano. La tabla `tasks` se conserva (es el
-- camino de relación time_entries → projects → clients que usan todas las
-- consultas de scoping y facturación), pero queda oculta: cada proyecto usa una
-- tarea contenedora y el detalle real vive en `title`.
--
-- Backfill: las entradas existentes toman como título el nombre de su tarea, así
-- los reportes históricos siguen mostrando la misma información.
--
-- Idempotente.
-- =============================================================================

ALTER TABLE public.time_entries
    ADD COLUMN IF NOT EXISTS title VARCHAR(255);

UPDATE public.time_entries te
   SET title = t.name
  FROM public.tasks t
 WHERE te.task_id = t.id
   AND te.title IS NULL;

-- Verificación:
--   SELECT COUNT(*) FILTER (WHERE title IS NULL) AS sin_titulo,
--          COUNT(*) AS total FROM public.time_entries;

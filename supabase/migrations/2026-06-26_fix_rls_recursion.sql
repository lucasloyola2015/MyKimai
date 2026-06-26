-- =============================================================================
-- 2026-06-26 — Fix: recursión infinita en políticas RLS (projects ⇄ project_access)
-- =============================================================================
-- Síntoma: cualquier lectura con el cliente anon (RLS) de projects/tasks/time_entries
-- fallaba con "infinite recursion detected in policy for relation projects".
-- Rompía el gráfico "Horas Trabajadas" del dashboard y las páginas que leen con
-- supabase-js (projects, hour-packages, import-kimai).
--
-- Causa: la migración F4 (project_access) creó políticas "Client users can view …"
-- con subqueries INLINE sobre project_access, y project_access_select con subquery
-- INLINE sobre projects → ciclo bajo RLS → recursión.
--
-- Fix: replicar la MISMA lógica de acceso en funciones SECURITY DEFINER (que NO
-- aplican RLS internamente, igual que is_client_owner / is_client_user_assigned que
-- ya usa el proyecto) y reescribir las 3 políticas recursivas para usarlas. La
-- semántica de visibilidad es idéntica; solo se rompe el ciclo.
--
-- Idempotente. SQL Editor en transacción.
-- =============================================================================

-- 1) ¿Puede el client_user autenticado ver ESTE proyecto?
--    (es client_user del cliente del proyecto Y (ve todo O tiene project_access))
CREATE OR REPLACE FUNCTION public.rls_client_user_sees_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM client_users cu
    JOIN projects p ON p.id = p_project_id
    WHERE cu.client_id = p.client_id
      AND cu.user_id = auth.uid()
      AND (
        cu.sees_all_projects = true
        OR EXISTS (
          SELECT 1 FROM project_access pa
          WHERE pa.project_id = p_project_id
            AND pa.client_user_id = cu.id
            AND pa.revoked_at IS NULL
        )
      )
  );
$$;

-- 2) ¿Puede ver la tarea? (delega en el proyecto de la tarea)
CREATE OR REPLACE FUNCTION public.rls_client_user_sees_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = p_task_id
      AND public.rls_client_user_sees_project(t.project_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.rls_client_user_sees_project(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rls_client_user_sees_task(uuid) TO authenticated, anon;

-- 3) Reescribir las 3 políticas recursivas para usar las funciones definer.

DROP POLICY IF EXISTS "Client users can view projects of their client" ON public.projects;
CREATE POLICY "Client users can view projects of their client"
  ON public.projects
  AS PERMISSIVE FOR SELECT TO public
  USING (public.rls_client_user_sees_project(id));

DROP POLICY IF EXISTS "Client users can view tasks of their client projects" ON public.tasks;
CREATE POLICY "Client users can view tasks of their client projects"
  ON public.tasks
  AS PERMISSIVE FOR SELECT TO public
  USING (public.rls_client_user_sees_project(project_id));

DROP POLICY IF EXISTS "Client users can view time entries of their client" ON public.time_entries;
CREATE POLICY "Client users can view time entries of their client"
  ON public.time_entries
  AS PERMISSIVE FOR SELECT TO public
  USING (public.rls_client_user_sees_task(task_id));

-- Verificación (no debe tirar "infinite recursion"):
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<un-user-id>","role":"authenticated"}', true);
--   SELECT count(*) FROM public.time_entries;   -- debe devolver un número, no error
--   RESET ROLE;

-- =====================================================================
-- §6 IMPROVEMENT_PLAN — F4 Multi-stakeholder client side
-- =====================================================================
-- Permite que distintas personas dentro del mismo cliente vean
-- diferentes proyectos. Caso Illinois: Jeremías (Odoo) y Agustín
-- (robots) no deben verse entre sí aunque el cliente legal sea uno solo.
--
-- Cambios:
--   1) ALTER client_users: agregar `sees_all_projects` (default TRUE
--      para preservar comportamiento legacy).
--   2) Nueva tabla `project_access`.
--   3) ALTER hour_packages: agregar `reserved_for_client_user_id` (FK
--      a client_users) para paquetes reservados a un stakeholder.
--   4) RLS sobre project_access y reglas extendidas en projects /
--      time_entries / invoices / hour_packages para filtrar por
--      project_access cuando `sees_all_projects = false`.
--
-- Ejecutar en Supabase SQL Editor.
-- =====================================================================

-- 1) Enum
DO $$ BEGIN
    CREATE TYPE public.project_access_role AS ENUM ('viewer', 'manager');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2) client_users.sees_all_projects
ALTER TABLE public.client_users
    ADD COLUMN IF NOT EXISTS sees_all_projects BOOLEAN NOT NULL DEFAULT TRUE;

-- 3) hour_packages.reserved_for_client_user_id
ALTER TABLE public.hour_packages
    ADD COLUMN IF NOT EXISTS reserved_for_client_user_id UUID
    REFERENCES public.client_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hour_packages_reserved_for
    ON public.hour_packages (reserved_for_client_user_id);

-- 4) Tabla project_access
CREATE TABLE IF NOT EXISTS public.project_access (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    client_user_id  UUID NOT NULL REFERENCES public.client_users(id) ON DELETE CASCADE,
    role            public.project_access_role NOT NULL DEFAULT 'viewer',
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by      UUID,
    revoked_at      TIMESTAMPTZ,
    UNIQUE (project_id, client_user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_access_project_id
    ON public.project_access (project_id);
CREATE INDEX IF NOT EXISTS idx_project_access_client_user_id
    ON public.project_access (client_user_id);

-- 5) RLS sobre project_access
ALTER TABLE public.project_access ENABLE ROW LEVEL SECURITY;

-- SELECT: el owner del cliente (via projects -> clients.user_id) ve todo
-- y el propio client_user ve solo sus filas.
DROP POLICY IF EXISTS project_access_select ON public.project_access;
CREATE POLICY project_access_select ON public.project_access
    FOR SELECT
    USING (
        -- Owner del proyecto
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = project_access.project_id
              AND c.user_id = auth.uid()
        )
        OR
        -- El propio client_user dueño del access
        EXISTS (
            SELECT 1 FROM public.client_users cu
            WHERE cu.id = project_access.client_user_id
              AND cu.user_id = auth.uid()
        )
    );

-- INSERT/UPDATE/DELETE: solo el owner del cliente del proyecto.
DROP POLICY IF EXISTS project_access_modify ON public.project_access;
CREATE POLICY project_access_modify ON public.project_access
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = project_access.project_id
              AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = project_access.project_id
              AND c.user_id = auth.uid()
        )
    );

-- =====================================================================
-- 6) Extender RLS de projects para client_users con acceso granular.
--    Las policies existentes "Client users can view projects of their
--    client" ya cubren el caso de sees_all_projects (todos los
--    client_users ven todos los proyectos del cliente). Reemplazamos esa
--    policy con una que respete sees_all_projects + project_access.
-- =====================================================================
DROP POLICY IF EXISTS "Client users can view projects of their client" ON public.projects;
CREATE POLICY "Client users can view projects of their client" ON public.projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.client_users cu
            WHERE cu.client_id = projects.client_id
              AND cu.user_id = auth.uid()
              AND (
                  cu.sees_all_projects = TRUE
                  OR EXISTS (
                      SELECT 1 FROM public.project_access pa
                      WHERE pa.project_id = projects.id
                        AND pa.client_user_id = cu.id
                        AND pa.revoked_at IS NULL
                  )
              )
        )
    );

-- Idem para tasks
DROP POLICY IF EXISTS "Client users can view tasks of their client projects" ON public.tasks;
CREATE POLICY "Client users can view tasks of their client projects" ON public.tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.client_users cu ON cu.client_id = p.client_id
            WHERE p.id = tasks.project_id
              AND cu.user_id = auth.uid()
              AND (
                  cu.sees_all_projects = TRUE
                  OR EXISTS (
                      SELECT 1 FROM public.project_access pa
                      WHERE pa.project_id = p.id
                        AND pa.client_user_id = cu.id
                        AND pa.revoked_at IS NULL
                  )
              )
        )
    );

-- Idem para time_entries (vía join task → project)
DROP POLICY IF EXISTS "Client users can view time entries of their client" ON public.time_entries;
CREATE POLICY "Client users can view time entries of their client" ON public.time_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.projects p ON p.id = t.project_id
            JOIN public.client_users cu ON cu.client_id = p.client_id
            WHERE t.id = time_entries.task_id
              AND cu.user_id = auth.uid()
              AND (
                  cu.sees_all_projects = TRUE
                  OR EXISTS (
                      SELECT 1 FROM public.project_access pa
                      WHERE pa.project_id = p.id
                        AND pa.client_user_id = cu.id
                        AND pa.revoked_at IS NULL
                  )
              )
        )
    );

-- Idem para hour_packages (con regla extra: si reserved_for_client_user_id
-- está seteado, solo ese stakeholder lo ve; si es null, requiere
-- sees_all_projects o acceso al project del paquete).
DROP POLICY IF EXISTS "Client users can view hour packages of their client" ON public.hour_packages;
CREATE POLICY "Client users can view hour packages of their client" ON public.hour_packages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.client_users cu
            WHERE cu.client_id = hour_packages.client_id
              AND cu.user_id = auth.uid()
              AND (
                  -- Paquete reservado: solo el stakeholder asignado lo ve
                  (hour_packages.reserved_for_client_user_id IS NOT NULL
                   AND hour_packages.reserved_for_client_user_id = cu.id)
                  OR
                  -- Paquete general (sin reserva): sees_all_projects o
                  -- acceso al proyecto del paquete
                  (hour_packages.reserved_for_client_user_id IS NULL
                   AND (
                       cu.sees_all_projects = TRUE
                       OR (
                           hour_packages.project_id IS NOT NULL
                           AND EXISTS (
                               SELECT 1 FROM public.project_access pa
                               WHERE pa.project_id = hour_packages.project_id
                                 AND pa.client_user_id = cu.id
                                 AND pa.revoked_at IS NULL
                           )
                       )
                   ))
              )
        )
    );

-- Idem para invoices: regla estricta — un client_user ve una invoice
-- SOLO si tiene acceso a TODOS los proyectos referenciados por sus
-- items (o sees_all_projects). Ver §6.4 del IMPROVEMENT_PLAN.
DROP POLICY IF EXISTS "Client users can view invoices of their client" ON public.invoices;
CREATE POLICY "Client users can view invoices of their client" ON public.invoices
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.client_users cu
            WHERE cu.client_id = invoices.client_id
              AND cu.user_id = auth.uid()
              AND (
                  cu.sees_all_projects = TRUE
                  OR (
                      -- No existe ningún item en proyectos a los que
                      -- el client_user NO tenga acceso.
                      NOT EXISTS (
                          SELECT 1 FROM public.invoice_items ii
                          JOIN public.time_entries te ON te.id = ii.time_entry_id
                          JOIN public.tasks t ON t.id = te.task_id
                          WHERE ii.invoice_id = invoices.id
                            AND NOT EXISTS (
                                SELECT 1 FROM public.project_access pa
                                WHERE pa.project_id = t.project_id
                                  AND pa.client_user_id = cu.id
                                  AND pa.revoked_at IS NULL
                            )
                      )
                  )
              )
        )
    );

-- =====================================================================
-- Verificación post-ejecución:
--   SELECT typname FROM pg_type WHERE typname = 'project_access_role';
--   SELECT tablename FROM pg_tables WHERE tablename = 'project_access';
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'client_users' AND column_name = 'sees_all_projects';
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'hour_packages' AND column_name = 'reserved_for_client_user_id';
-- =====================================================================

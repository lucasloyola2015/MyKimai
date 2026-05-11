-- =====================================================================
-- §5 IMPROVEMENT_PLAN — F2.C Extensión de RLS para team_members
-- =====================================================================
-- Una vez creada la tabla `team_members` (ver
-- 2026-05-11_team_members.sql), extendemos las RLS existentes para que
-- los miembros activos del workspace puedan leer datos del owner.
--
-- IMPORTANTE: Estas policies se SUMAN a las existentes — se combinan con
-- OR en PostgreSQL. No se reemplaza ninguna policy del owner ni del
-- portal cliente. El comportamiento actual queda intacto y se agrega un
-- camino adicional para team_members.
--
-- Convención de naming: las nuevas policies se prefijan con
-- "team_members_can_..." para diferenciar.
--
-- Ejecutar en Supabase SQL Editor después del script de creación de la
-- tabla `team_members`.
-- =====================================================================

-- =====================================================================
-- 1) clients
-- =====================================================================
DROP POLICY IF EXISTS team_members_can_view_clients ON public.clients;
CREATE POLICY team_members_can_view_clients ON public.clients
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.owner_id = clients.user_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
        )
    );

-- =====================================================================
-- 2) projects
-- =====================================================================
DROP POLICY IF EXISTS team_members_can_view_projects ON public.projects;
CREATE POLICY team_members_can_view_projects ON public.projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            JOIN public.team_members tm ON tm.owner_id = c.user_id
            WHERE c.id = projects.client_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
        )
    );

-- =====================================================================
-- 3) tasks
-- =====================================================================
DROP POLICY IF EXISTS team_members_can_view_tasks ON public.tasks;
CREATE POLICY team_members_can_view_tasks ON public.tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.clients c ON c.id = p.client_id
            JOIN public.team_members tm ON tm.owner_id = c.user_id
            WHERE p.id = tasks.project_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
        )
    );

-- =====================================================================
-- 4) time_entries — los team_members pueden:
--    - LEER todas las entradas del workspace (para ver progreso conjunto).
--    - INSERTAR entradas a su propio nombre en tareas del workspace.
--    - UPDATE/DELETE solo de SUS propias entradas (las modificaciones de
--      otros miembros las hace el owner via dashboard).
-- =====================================================================
DROP POLICY IF EXISTS team_members_can_view_time_entries ON public.time_entries;
CREATE POLICY team_members_can_view_time_entries ON public.time_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.projects p ON p.id = t.project_id
            JOIN public.clients c ON c.id = p.client_id
            JOIN public.team_members tm ON tm.owner_id = c.user_id
            WHERE t.id = time_entries.task_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
        )
    );

DROP POLICY IF EXISTS team_members_can_insert_time_entries ON public.time_entries;
CREATE POLICY team_members_can_insert_time_entries ON public.time_entries
    FOR INSERT
    WITH CHECK (
        -- Que la entrada se cree a nombre del actor
        user_id = auth.uid()
        AND
        -- Y que la tarea pertenezca a un workspace donde es team member activo
        EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.projects p ON p.id = t.project_id
            JOIN public.clients c ON c.id = p.client_id
            JOIN public.team_members tm ON tm.owner_id = c.user_id
            WHERE t.id = time_entries.task_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
        )
    );

DROP POLICY IF EXISTS team_members_can_update_own_time_entries ON public.time_entries;
CREATE POLICY team_members_can_update_own_time_entries ON public.time_entries
    FOR UPDATE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS team_members_can_delete_own_time_entries ON public.time_entries;
CREATE POLICY team_members_can_delete_own_time_entries ON public.time_entries
    FOR DELETE
    USING (user_id = auth.uid());

-- =====================================================================
-- 5) time_entry_breaks — heredan permiso de time_entries via user_id
-- =====================================================================
DROP POLICY IF EXISTS team_members_can_manage_own_breaks ON public.time_entry_breaks;
CREATE POLICY team_members_can_manage_own_breaks ON public.time_entry_breaks
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.time_entries te
            WHERE te.id = time_entry_breaks.time_entry_id
              AND te.user_id = auth.uid()
        )
    );

-- =====================================================================
-- 6) hour_packages — los team_members pueden LEER (no mutar)
-- =====================================================================
DROP POLICY IF EXISTS team_members_can_view_hour_packages ON public.hour_packages;
CREATE POLICY team_members_can_view_hour_packages ON public.hour_packages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            JOIN public.team_members tm ON tm.owner_id = c.user_id
            WHERE c.id = hour_packages.client_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
        )
    );

-- =====================================================================
-- 7) invoices — SOLO los team_members con role='admin' pueden LEER.
--    Collaborators NO ven facturas (defensa en profundidad sobre §F2.D).
-- =====================================================================
DROP POLICY IF EXISTS team_members_admins_can_view_invoices ON public.invoices;
CREATE POLICY team_members_admins_can_view_invoices ON public.invoices
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            JOIN public.team_members tm ON tm.owner_id = c.user_id
            WHERE c.id = invoices.client_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
              AND tm.role = 'admin'
        )
    );

DROP POLICY IF EXISTS team_members_admins_can_view_invoice_items ON public.invoice_items;
CREATE POLICY team_members_admins_can_view_invoice_items ON public.invoice_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.clients c ON c.id = i.client_id
            JOIN public.team_members tm ON tm.owner_id = c.user_id
            WHERE i.id = invoice_items.invoice_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
              AND tm.role = 'admin'
        )
    );

-- =====================================================================
-- 8) payments — idéntico: solo team_members admin
-- =====================================================================
DROP POLICY IF EXISTS team_members_admins_can_view_payments ON public.payments;
CREATE POLICY team_members_admins_can_view_payments ON public.payments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.clients c ON c.id = i.client_id
            JOIN public.team_members tm ON tm.owner_id = c.user_id
            WHERE i.id = payments.invoice_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
              AND tm.role = 'admin'
        )
    );

-- =====================================================================
-- Verificación post-ejecución:
--   SELECT tablename, policyname, cmd FROM pg_policies
--     WHERE schemaname = 'public' AND policyname LIKE 'team_members%'
--     ORDER BY tablename, cmd, policyname;
--
-- Deberías ver ~12 policies nuevas distribuidas entre clients, projects,
-- tasks, time_entries, time_entry_breaks, hour_packages, invoices,
-- invoice_items, payments.
-- =====================================================================

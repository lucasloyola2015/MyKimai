-- =====================================================================
-- §7 IMPROVEMENT_PLAN — F5 Hitos / Milestones
-- =====================================================================
-- Permite reportar progreso al cliente: hitos planificados / en curso /
-- completados, con horas presupuestadas vs reales.
--
-- Ejecutar en Supabase SQL Editor.
-- =====================================================================

-- 1) Enum milestone_status
DO $$ BEGIN
    CREATE TYPE public.milestone_status AS ENUM (
        'planned',
        'in_progress',
        'completed',
        'blocked',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2) Tabla milestones
CREATE TABLE IF NOT EXISTS public.milestones (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    target_date       DATE,
    status            public.milestone_status NOT NULL DEFAULT 'planned',
    completed_at      TIMESTAMPTZ,
    completion_notes  TEXT,
    budget_hours      NUMERIC(10, 2),
    budget_amount     NUMERIC(10, 2),
    budget_currency   VARCHAR(3),
    actual_hours      NUMERIC(10, 2),
    actual_amount     NUMERIC(10, 2),
    display_order     INTEGER NOT NULL DEFAULT 0,
    visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_project_order
    ON public.milestones (project_id, display_order);
CREATE INDEX IF NOT EXISTS idx_milestones_status
    ON public.milestones (status);

-- Trigger updated_at
DO $$ BEGIN
    CREATE TRIGGER update_milestones_updated_at
        BEFORE UPDATE ON public.milestones
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3) Columna milestone_id en time_entries
ALTER TABLE public.time_entries
    ADD COLUMN IF NOT EXISTS milestone_id UUID
    REFERENCES public.milestones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_milestone_id
    ON public.time_entries (milestone_id);

-- 4) RLS sobre milestones
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- SELECT: owner del proyecto + team members del owner + client_users
-- con acceso al proyecto (respetando visible_to_client).
DROP POLICY IF EXISTS milestones_select ON public.milestones;
CREATE POLICY milestones_select ON public.milestones
    FOR SELECT
    USING (
        -- Owner del proyecto
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = milestones.project_id
              AND c.user_id = auth.uid()
        )
        OR
        -- Team member del workspace
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.clients c ON c.id = p.client_id
            JOIN public.team_members tm ON tm.owner_id = c.user_id
            WHERE p.id = milestones.project_id
              AND tm.user_id = auth.uid()
              AND tm.removed_at IS NULL
        )
        OR
        -- Client_user con acceso al proyecto (y milestone visible_to_client)
        (milestones.visible_to_client = TRUE AND EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.client_users cu ON cu.client_id = p.client_id
            WHERE p.id = milestones.project_id
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
        ))
    );

-- INSERT/UPDATE/DELETE: solo el owner del proyecto.
DROP POLICY IF EXISTS milestones_modify ON public.milestones;
CREATE POLICY milestones_modify ON public.milestones
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = milestones.project_id
              AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = milestones.project_id
              AND c.user_id = auth.uid()
        )
    );

-- =====================================================================
-- Verificación post-ejecución:
--   SELECT typname FROM pg_type WHERE typname = 'milestone_status';
--   SELECT tablename FROM pg_tables WHERE tablename = 'milestones';
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'time_entries' AND column_name = 'milestone_id';
-- =====================================================================

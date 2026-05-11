-- =====================================================================
-- §5 IMPROVEMENT_PLAN — F2 Multi-user provider side (Opción B)
-- =====================================================================
-- Crea la tabla `team_members` para que el owner del workspace (Lucas)
-- pueda invitar colaboradores (Lucio, Antonela) que cargan horas en sus
-- proyectos sin compartir credenciales.
--
-- Ejecutar en Supabase SQL Editor → New query.
-- Es idempotente: usar IF NOT EXISTS / DO blocks.
-- =====================================================================

-- 1) Enum de roles
DO $$ BEGIN
    CREATE TYPE public.team_role AS ENUM ('collaborator', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2) Tabla team_members
CREATE TABLE IF NOT EXISTS public.team_members (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role              public.team_role NOT NULL DEFAULT 'collaborator',
    default_rate      NUMERIC(10, 2),
    default_currency  VARCHAR(3),
    invited_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at       TIMESTAMPTZ,
    removed_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, user_id),
    -- Owner y miembro no pueden ser la misma persona (sería redundante;
    -- el owner ya tiene acceso total por user_id en clients).
    CHECK (owner_id <> user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_owner_id ON public.team_members (owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id  ON public.team_members (user_id);
-- Lookup más frecuente: "este user es member activo de quién"
CREATE INDEX IF NOT EXISTS idx_team_members_user_active
    ON public.team_members (user_id, removed_at);

-- 3) Trigger para mantener updated_at (usa la función ya existente en el proyecto)
DO $$ BEGIN
    CREATE TRIGGER update_team_members_updated_at
        BEFORE UPDATE ON public.team_members
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 4) RLS sobre la propia tabla team_members
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- SELECT: el owner ve sus memberships; el member ve los propios.
DROP POLICY IF EXISTS team_members_select ON public.team_members;
CREATE POLICY team_members_select ON public.team_members
    FOR SELECT
    USING (
        owner_id = auth.uid()
        OR user_id = auth.uid()
    );

-- INSERT: solo el owner puede agregar miembros a SU workspace.
DROP POLICY IF EXISTS team_members_insert ON public.team_members;
CREATE POLICY team_members_insert ON public.team_members
    FOR INSERT
    WITH CHECK (owner_id = auth.uid());

-- UPDATE: solo el owner puede editar (cambiar rol, marcar removed_at, etc.).
DROP POLICY IF EXISTS team_members_update ON public.team_members;
CREATE POLICY team_members_update ON public.team_members
    FOR UPDATE
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- DELETE: solo el owner puede borrar (en general usar soft-delete con removed_at).
DROP POLICY IF EXISTS team_members_delete ON public.team_members;
CREATE POLICY team_members_delete ON public.team_members
    FOR DELETE
    USING (owner_id = auth.uid());

-- =====================================================================
-- Verificación post-ejecución (correr en SQL Editor para validar):
--
--   SELECT typname, enumlabel FROM pg_type t
--     JOIN pg_enum e ON t.oid = e.enumtypid WHERE typname = 'team_role';
--   --> debe devolver: collaborator, admin
--
--   SELECT tablename, rowsecurity FROM pg_tables
--     WHERE schemaname = 'public' AND tablename = 'team_members';
--   --> rowsecurity = true
--
--   SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname = 'public' AND tablename = 'team_members';
--   --> 4 policies: select, insert, update, delete
-- =====================================================================

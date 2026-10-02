-- =============================================================================
-- 2026-10-02 — API keys para agentes de IA (acceso al sistema sin cookie)
-- =============================================================================
-- Los agentes de IA (vía MCP) consultan y cargan horas con una API key personal.
--
-- 1) `api_keys`: la key actúa COMO el usuario que la creó. El contexto del
--    workspace (owner / admin / collaborator) se resuelve en cada request a
--    partir de `user_id`, así que sacar a alguien del equipo corta sus keys.
--    Solo se guarda el HASH (sha256) de la key; el valor se muestra una vez.
--    `scopes`: 'read' (consultar), 'write' (cargar/editar horas),
--    'financials' (montos/tarifas/facturas; solo rige si el rol los puede ver).
--
-- 2) `time_entries`: trazabilidad de lo que carga un agente.
--    - `source`      'ui' | 'api' (la UI muestra 🤖 para 'api').
--    - `api_key_id`  qué key la creó (SET NULL si la key se borra).
--    - `external_ref` referencia idempotente del agente: re-correr el skill
--      actualiza la misma entrada en vez de duplicarla. Única por usuario.
--
-- RLS: `api_keys` queda con RLS activa y SIN policies → invisible para los
-- clientes anon/authenticated de Supabase. Solo la lee Prisma (server-side).
--
-- Idempotente. Sin CREATE INDEX CONCURRENTLY (el SQL Editor corre en transacción).
-- =============================================================================

-- 1) Tabla api_keys -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_keys (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    key_prefix    VARCHAR(16)  NOT NULL,
    key_hash      CHAR(64)     NOT NULL UNIQUE,
    scopes        TEXT[]       NOT NULL DEFAULT ARRAY['read', 'write']::TEXT[],
    last_used_at  TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT api_keys_scopes_valid
        CHECK (scopes <@ ARRAY['read', 'write', 'financials']::TEXT[])
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys (user_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_keys FROM anon, authenticated;

-- 2) Trazabilidad en time_entries --------------------------------------------
ALTER TABLE public.time_entries
    ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'ui';

ALTER TABLE public.time_entries
    ADD COLUMN IF NOT EXISTS api_key_id UUID
        REFERENCES public.api_keys(id) ON DELETE SET NULL;

ALTER TABLE public.time_entries
    ADD COLUMN IF NOT EXISTS external_ref VARCHAR(255);

DO $$ BEGIN
    ALTER TABLE public.time_entries
        ADD CONSTRAINT time_entries_source_valid CHECK (source IN ('ui', 'api'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_time_entries_user_external_ref
    ON public.time_entries (user_id, external_ref)
    WHERE external_ref IS NOT NULL;

-- Verificación:
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'time_entries'
--      AND column_name IN ('source', 'api_key_id', 'external_ref');
--   SELECT COUNT(*) FILTER (WHERE source = 'ui') AS ui, COUNT(*) AS total
--     FROM public.time_entries;
--   SELECT indexname FROM pg_indexes WHERE indexname = 'uniq_time_entries_user_external_ref';
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'api_keys';

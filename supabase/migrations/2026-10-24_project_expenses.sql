-- =============================================================================
-- 2026-10-24 — Gastos extra de proyecto (compras, materiales) y sus comprobantes
-- =============================================================================
-- Un gasto es algo que Lucas paga para un proyecto (ej. un conversor serial para
-- "Medidor de Potencia") y se le refactura al cliente: entra en la próxima
-- factura como una línea de detalle (invoice_items.type = 'expense'), sin
-- descuento. Los adjuntos (foto, factura del proveedor) quedan solo en el
-- sistema: viven en el bucket PRIVADO `expense-attachments` y no salen en la FC.
--
-- - project_expenses.invoice_id: NULL = pendiente de facturar. ON DELETE SET NULL
--   → borrar una factura (sin CAE) libera sus gastos, igual que las horas.
-- - Idempotente. Corre en transacción (scripts/db.mjs).
-- =============================================================================

-- 1) Tipo de línea de factura para gastos
ALTER TYPE public.invoice_item_type ADD VALUE IF NOT EXISTS 'expense';

-- 2) Gastos
CREATE TABLE IF NOT EXISTS public.project_expenses (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    description   VARCHAR(500) NOT NULL,
    supplier      VARCHAR(255),
    expense_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    amount        NUMERIC(12, 2) NOT NULL,
    currency      VARCHAR(3) NOT NULL DEFAULT 'ARS',
    billable      BOOLEAN NOT NULL DEFAULT TRUE,
    notes         TEXT,
    invoice_id    UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_project_expenses_amount_pos CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_project_expenses_project_id
    ON public.project_expenses (project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_invoice_id
    ON public.project_expenses (invoice_id);

DO $$ BEGIN
    CREATE TRIGGER update_project_expenses_updated_at
        BEFORE UPDATE ON public.project_expenses
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3) Adjuntos (fotos, factura del proveedor)
CREATE TABLE IF NOT EXISTS public.project_expense_attachments (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id    UUID NOT NULL REFERENCES public.project_expenses(id) ON DELETE CASCADE,
    storage_path  TEXT NOT NULL UNIQUE,
    file_name     VARCHAR(255) NOT NULL,
    mime_type     VARCHAR(100),
    size_bytes    INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_expense_attachments_expense_id
    ON public.project_expense_attachments (expense_id);

-- 4) RLS (defensa en profundidad: la app entra por Prisma, que la bypasea).
--    Solo el owner del proyecto; el portal cliente no ve gastos.
ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_expense_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_expenses_owner ON public.project_expenses;
CREATE POLICY project_expenses_owner ON public.project_expenses
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = project_expenses.project_id
          AND c.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = project_expenses.project_id
          AND c.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS project_expense_attachments_owner ON public.project_expense_attachments;
CREATE POLICY project_expense_attachments_owner ON public.project_expense_attachments
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.project_expenses e
        JOIN public.projects p ON p.id = e.project_id
        JOIN public.clients c ON c.id = p.client_id
        WHERE e.id = project_expense_attachments.expense_id
          AND c.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.project_expenses e
        JOIN public.projects p ON p.id = e.project_id
        JOIN public.clients c ON c.id = p.client_id
        WHERE e.id = project_expense_attachments.expense_id
          AND c.user_id = auth.uid()
    ));

-- 5) Bucket privado para los comprobantes. Sin policies sobre storage.objects:
--    se sube con URLs firmadas que emite el servidor (service role) y se
--    descarga con URLs firmadas de corta vida.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'expense-attachments',
    'expense-attachments',
    FALSE,
    20971520, -- 20 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Verificación:
--   SELECT unnest(enum_range(NULL::invoice_item_type));            -- incluye 'expense'
--   SELECT count(*) FROM project_expenses;                         -- 0
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('project_expenses','project_expense_attachments');  -- t, t
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'expense-attachments';

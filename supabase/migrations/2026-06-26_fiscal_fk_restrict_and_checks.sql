-- =============================================================================
-- 2026-06-26 — Protección de datos fiscales + CHECK constraints (defensa en prof.)
-- =============================================================================
-- Análisis de diseño (ANALISIS_DISENO_2026-06.md) §5:
--   DATA-1: borrar un cliente CASCADEA y destruye físicamente sus invoices
--           (incl. LEGAL con CAE de AFIP), invoice_items y payments. Cambiamos
--           SOLO invoices.client_id -> clients a ON DELETE RESTRICT: ahora la DB
--           rechaza borrar un cliente con facturas. (invoice_items/payments
--           siguen en CASCADE: borrar UNA factura sin CAE sí elimina sus ítems
--           y pagos — de eso depende deleteInvoice.)
--   DATA-3: cero CHECK constraints sobre dinero/duración/rangos. Agregamos los
--           mínimos como NOT VALID (se aplican a nuevas filas/updates sin fallar
--           por datos legacy; pueden VALIDARSE luego).
--
-- Idempotente. El SQL Editor corre en transacción → sin CREATE INDEX CONCURRENTLY.
-- =============================================================================

-- 1) invoices.client_id -> clients : Cascade -> Restrict ----------------------
-- Buscamos el nombre real del FK (el schema fue introspectado) y lo recreamos.
DO $$
DECLARE
    cname text;
BEGIN
    SELECT con.conname
      INTO cname
      FROM pg_constraint con
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid
       AND att.attnum = ANY (con.conkey)
     WHERE con.conrelid = 'public.invoices'::regclass
       AND con.contype = 'f'
       AND att.attname = 'client_id'
     LIMIT 1;

    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', cname);
    END IF;

    ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id)
        ON DELETE RESTRICT ON UPDATE NO ACTION;
END $$;

-- 2) CHECK constraints (NOT VALID: enforce en nuevas filas, no rompe legacy) ---
ALTER TABLE public.payments         DROP CONSTRAINT IF EXISTS chk_payments_amount_positive;
ALTER TABLE public.payments         ADD  CONSTRAINT chk_payments_amount_positive
    CHECK (amount > 0) NOT VALID;

ALTER TABLE public.hour_packages    DROP CONSTRAINT IF EXISTS chk_hour_packages_hours;
ALTER TABLE public.hour_packages    ADD  CONSTRAINT chk_hour_packages_hours
    CHECK (hours >= 0 AND hours_used >= 0 AND hours_used <= hours) NOT VALID;

ALTER TABLE public.invoice_items    DROP CONSTRAINT IF EXISTS chk_invoice_items_nonneg;
ALTER TABLE public.invoice_items    ADD  CONSTRAINT chk_invoice_items_nonneg
    CHECK (quantity >= 0 AND rate >= 0 AND amount >= 0) NOT VALID;

ALTER TABLE public.invoices         DROP CONSTRAINT IF EXISTS chk_invoices_nonneg;
ALTER TABLE public.invoices         ADD  CONSTRAINT chk_invoices_nonneg
    CHECK (total_amount >= 0 AND subtotal >= 0) NOT VALID;

ALTER TABLE public.time_entries     DROP CONSTRAINT IF EXISTS chk_time_entries_sane;
ALTER TABLE public.time_entries     ADD  CONSTRAINT chk_time_entries_sane
    CHECK (
        (end_time IS NULL OR end_time > start_time)
        AND (amount IS NULL OR amount >= 0)
        AND (duration_neto IS NULL OR duration_neto >= 0)
    ) NOT VALID;

ALTER TABLE public.time_entry_breaks DROP CONSTRAINT IF EXISTS chk_breaks_sane;
ALTER TABLE public.time_entry_breaks ADD  CONSTRAINT chk_breaks_sane
    CHECK (end_time IS NULL OR end_time >= start_time) NOT VALID;

-- Verificación rápida:
--   SELECT conname, confdeltype FROM pg_constraint
--    WHERE conrelid='public.invoices'::regclass AND contype='f';   -- confdeltype debe ser 'r' (RESTRICT)
--   SELECT conname FROM pg_constraint WHERE conname LIKE 'chk_%';

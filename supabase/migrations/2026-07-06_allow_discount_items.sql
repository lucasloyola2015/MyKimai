-- =============================================================================
-- 2026-07-06 — Permitir líneas de DESCUENTO (importes negativos) en invoice_items
-- =============================================================================
-- BUG: el CHECK `chk_invoice_items_nonneg` (agregado en
-- 2026-06-26_fiscal_fk_restrict_and_checks.sql) exigía rate >= 0 AND amount >= 0.
-- Un descuento es, por definición, una línea NEGATIVA que resta del total → la
-- inserción fallaba y con ella toda la transacción de creación de la factura.
--
-- FIX: se conserva el guard sobre `quantity` (nunca negativa) y se permite que
-- rate/amount sean negativos SOLO de forma coherente entre sí (ambos <= 0 para
-- descuentos, ambos >= 0 para cargos), evitando filas con signos contradictorios.
--
-- Idempotente.
-- =============================================================================

ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS chk_invoice_items_nonneg;

ALTER TABLE public.invoice_items
    ADD CONSTRAINT chk_invoice_items_nonneg
    CHECK (
        quantity >= 0
        AND (
            (rate >= 0 AND amount >= 0)   -- línea normal (trabajo / cargo)
            OR
            (rate <= 0 AND amount <= 0)   -- línea de descuento (resta)
        )
    ) NOT VALID;

-- Verificación:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'chk_invoice_items_nonneg';
--   -- y debe aceptar: INSERT ... (quantity 1, rate -100, amount -100)

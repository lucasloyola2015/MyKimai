-- Enable RLS on tables where it is missing
ALTER TABLE public.user_fiscal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Policies for user_fiscal_settings

-- 1. Owners can view their own settings
CREATE POLICY "Users can view own fiscal settings" ON public.user_fiscal_settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Owners can insert their own settings
CREATE POLICY "Users can insert own fiscal settings" ON public.user_fiscal_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. Owners can update their own settings
CREATE POLICY "Users can update own fiscal settings" ON public.user_fiscal_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 4. Owners can delete their own settings
CREATE POLICY "Users can delete own fiscal settings" ON public.user_fiscal_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Portal users (clients) can view their provider's fiscal settings (e.g. for invoice display)
CREATE POLICY "Portal users can view provider fiscal settings" ON public.user_fiscal_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.user_id = user_fiscal_settings.user_id
        AND c.portal_user_id = auth.uid()
    )
  );


-- Policies for payments

-- 1. Owners can view payments related to their clients/invoices
CREATE POLICY "Users can view payments linked to their clients" ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.clients c ON c.id = i.client_id
      WHERE i.id = payments.invoice_id
        AND c.user_id = auth.uid()
    )
  );

-- 2. Portal users can view payments related to their invoices
CREATE POLICY "Portal users can view own payments" ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.clients c ON c.id = i.client_id
      WHERE i.id = payments.invoice_id
        AND c.portal_user_id = auth.uid()
    )
  );

-- 3. Owners can manage (insert/update/delete) payments for their clients/invoices
CREATE POLICY "Users can insert payments linked to their clients" ON public.payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.clients c ON c.id = i.client_id
      WHERE i.id = payments.invoice_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update payments linked to their clients" ON public.payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.clients c ON c.id = i.client_id
      WHERE i.id = payments.invoice_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete payments linked to their clients" ON public.payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.clients c ON c.id = i.client_id
      WHERE i.id = payments.invoice_id
        AND c.user_id = auth.uid()
    )
  );

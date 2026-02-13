-- Verificar enum invoice_status
SELECT unnest(enum_range(NULL::invoice_status)) AS invoice_status_values;

-- Verificar tabla user_fiscal_settings
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_fiscal_settings'
ORDER BY ordinal_position;

-- Verificar índices de user_fiscal_settings
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'user_fiscal_settings';

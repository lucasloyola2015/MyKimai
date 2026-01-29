-- Script para verificar que los tipos ENUM existen en PostgreSQL
-- Ejecuta este script en Supabase SQL Editor para verificar

-- Verificar tipos ENUM existentes
SELECT 
    t.typname AS enum_name,
    e.enumlabel AS enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname IN ('ProjectStatus', 'InvoiceStatus', 'BillingType', 'InvoiceItemType', 'AccessLevel')
ORDER BY t.typname, e.enumsortorder;

-- Verificar estructura de la tabla projects para ver el tipo de la columna status
SELECT 
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'projects'
AND column_name IN ('status', 'billing_type');

-- Verificar estructura de la tabla invoices para ver el tipo de la columna status
SELECT 
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'invoices'
AND column_name = 'status';

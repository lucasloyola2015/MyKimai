-- Fix: Function Search Path Mutable
-- This block dynamically sets the search_path to 'public' for the identified functions 
-- to prevent potential security vulnerabilities.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as args
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname IN (
            'update_entry_duration_on_break',
            'get_cascade_rate',
            'calculate_time_entry_duration',
            'update_updated_at_column',
            'generate_invoice_number',
            'get_applied_rate'
        )
    LOOP
        RAISE NOTICE 'Setting search_path for function: % (%)', r.proname, r.args;
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', r.proname, r.args);
    END LOOP;
END $$;

-- Fix: Leaked Password Protection
-- This cannot be fixed via SQL directly. Please enable it in your Supabase Dashboard:
-- 1. Go to Authentication > Settings > Security
-- 2. Scroll to "Password Protection"
-- 3. Enable "Enable leaked password protection"

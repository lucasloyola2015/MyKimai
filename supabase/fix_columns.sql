-- Asegurar que las columnas existen en la tabla clients
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'logo_url') THEN
        ALTER TABLE public.clients ADD COLUMN logo_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'web_access_enabled') THEN
        ALTER TABLE public.clients ADD COLUMN web_access_enabled BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'portal_user_id') THEN
        ALTER TABLE public.clients ADD COLUMN portal_user_id UUID UNIQUE;
    END IF;
END $$;

-- Asegurar que las columnas existen en la tabla time_entries
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'time_entries' AND column_name = 'duration_neto') THEN
        ALTER TABLE public.time_entries ADD COLUMN duration_neto INTEGER DEFAULT 0;
    END IF;
    
    -- Verificar si existe duration_minutes, si no existe y existe duration_total, tal vez sea esa
    -- Pero para consistencia con el código, nos aseguramos que duration_neto esté presente.
END $$;

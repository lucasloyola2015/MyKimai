-- Alterar columnas para usar tipos ENUM en lugar de VARCHAR/TEXT
-- IMPORTANTE: Ejecuta este script DESPUÉS de crear los tipos ENUM (002_create_enums.sql)

-- Verificar tipos ENUM existentes primero
DO $$ 
BEGIN
    -- Alterar columna status en tabla projects para usar ProjectStatus
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectStatus') THEN
        ALTER TABLE public.projects 
        ALTER COLUMN status TYPE public."ProjectStatus" 
        USING status::text::public."ProjectStatus";
        
        RAISE NOTICE 'Columna projects.status alterada a ProjectStatus';
    ELSE
        RAISE EXCEPTION 'Tipo ProjectStatus no existe. Ejecuta primero 002_create_enums.sql';
    END IF;

    -- Alterar columna billing_type en tabla projects para usar BillingType
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingType') THEN
        ALTER TABLE public.projects 
        ALTER COLUMN billing_type TYPE public."BillingType" 
        USING billing_type::text::public."BillingType";
        
        RAISE NOTICE 'Columna projects.billing_type alterada a BillingType';
    ELSE
        RAISE EXCEPTION 'Tipo BillingType no existe. Ejecuta primero 002_create_enums.sql';
    END IF;

    -- Alterar columna status en tabla invoices para usar InvoiceStatus
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceStatus') THEN
        ALTER TABLE public.invoices 
        ALTER COLUMN status TYPE public."InvoiceStatus" 
        USING status::text::public."InvoiceStatus";
        
        RAISE NOTICE 'Columna invoices.status alterada a InvoiceStatus';
    ELSE
        RAISE EXCEPTION 'Tipo InvoiceStatus no existe. Ejecuta primero 002_create_enums.sql';
    END IF;

    -- Alterar columna type en tabla invoice_items para usar InvoiceItemType
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceItemType') THEN
        ALTER TABLE public.invoice_items 
        ALTER COLUMN type TYPE public."InvoiceItemType" 
        USING type::text::public."InvoiceItemType";
        
        RAISE NOTICE 'Columna invoice_items.type alterada a InvoiceItemType';
    ELSE
        RAISE EXCEPTION 'Tipo InvoiceItemType no existe. Ejecuta primero 002_create_enums.sql';
    END IF;

    -- Alterar columna access_level en tabla client_users para usar AccessLevel
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccessLevel') THEN
        ALTER TABLE public.client_users 
        ALTER COLUMN access_level TYPE public."AccessLevel" 
        USING access_level::text::public."AccessLevel";
        
        RAISE NOTICE 'Columna client_users.access_level alterada a AccessLevel';
    ELSE
        RAISE EXCEPTION 'Tipo AccessLevel no existe. Ejecuta primero 002_create_enums.sql';
    END IF;
END $$;

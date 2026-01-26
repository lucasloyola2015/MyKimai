-- ============================================
-- Sistema de Gestión de Tiempos Simplificado
-- Script de Migración Inicial para Supabase
-- ============================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

-- Tipo de facturación
CREATE TYPE billing_type AS ENUM ('fixed', 'hourly');

-- Estado de proyecto
CREATE TYPE project_status AS ENUM ('active', 'paused', 'completed', 'cancelled');

-- Estado de factura
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue');

-- Tipo de item de factura
CREATE TYPE invoice_item_type AS ENUM ('time', 'fixed');

-- Nivel de acceso para clientes
CREATE TYPE access_level AS ENUM ('read', 'read_write');

-- ============================================
-- TABLA: clients (Clientes)
-- ============================================

CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    default_rate DECIMAL(10, 2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para clients
CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_name ON clients(name);

-- ============================================
-- TABLA: projects (Proyectos)
-- ============================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    rate DECIMAL(10, 2),
    billing_type billing_type NOT NULL DEFAULT 'hourly',
    status project_status NOT NULL DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para projects
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_name ON projects(name);

-- ============================================
-- TABLA: tasks (Tareas)
-- ============================================

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rate DECIMAL(10, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para tasks
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_name ON tasks(name);

-- ============================================
-- TABLA: time_entries (Períodos de Trabajo)
-- ============================================

CREATE TABLE time_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_minutes INTEGER,
    billable BOOLEAN NOT NULL DEFAULT true,
    rate_applied DECIMAL(10, 2), -- Tarifa aplicada al momento de crear (para historial)
    amount DECIMAL(10, 2), -- Cantidad calculada (duration * rate)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Validación: end_time debe ser mayor que start_time
    CONSTRAINT check_time_entry_duration CHECK (
        end_time IS NULL OR end_time > start_time
    )
);

-- Índices para time_entries
CREATE INDEX idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX idx_time_entries_task_id ON time_entries(task_id);
CREATE INDEX idx_time_entries_start_time ON time_entries(start_time);
CREATE INDEX idx_time_entries_billable ON time_entries(billable);
CREATE INDEX idx_time_entries_created_at ON time_entries(created_at DESC);

-- Índice compuesto para queries frecuentes
CREATE INDEX idx_time_entries_user_date ON time_entries(user_id, start_time DESC);

-- ============================================
-- TABLA: hour_packages (Paquetes de Horas)
-- ============================================

CREATE TABLE hour_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    hours DECIMAL(10, 2) NOT NULL CHECK (hours > 0),
    hours_used DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (hours_used >= 0),
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Validación: horas usadas no pueden exceder horas totales
    CONSTRAINT check_hour_package_usage CHECK (hours_used <= hours)
);

-- Índices para hour_packages
CREATE INDEX idx_hour_packages_client_id ON hour_packages(client_id);
CREATE INDEX idx_hour_packages_project_id ON hour_packages(project_id);
CREATE INDEX idx_hour_packages_expires_at ON hour_packages(expires_at);

-- ============================================
-- TABLA: invoices (Facturas)
-- ============================================

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    status invoice_status NOT NULL DEFAULT 'draft',
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para invoices
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date DESC);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

-- ============================================
-- TABLA: invoice_items (Items de Factura)
-- ============================================

CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    time_entry_id UUID REFERENCES time_entries(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
    rate DECIMAL(10, 2) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    type invoice_item_type NOT NULL DEFAULT 'time',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para invoice_items
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_time_entry_id ON invoice_items(time_entry_id);

-- ============================================
-- TABLA: client_users (Usuarios Invitados - Portal de Clientes)
-- ============================================

CREATE TABLE client_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    access_level access_level NOT NULL DEFAULT 'read',
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Un email solo puede estar asociado a un cliente
    UNIQUE(client_id, email)
);

-- Índices para client_users
CREATE INDEX idx_client_users_client_id ON client_users(client_id);
CREATE INDEX idx_client_users_user_id ON client_users(user_id);
CREATE INDEX idx_client_users_email ON client_users(email);

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON time_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hour_packages_updated_at BEFORE UPDATE ON hour_packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para calcular duration_minutes automáticamente
CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
        
        -- Calcular amount si rate_applied está definido
        IF NEW.rate_applied IS NOT NULL AND NEW.duration_minutes > 0 THEN
            NEW.amount := (NEW.duration_minutes / 60.0) * NEW.rate_applied;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_time_entry_duration_trigger
    BEFORE INSERT OR UPDATE ON time_entries
    FOR EACH ROW EXECUTE FUNCTION calculate_time_entry_duration();

-- Función para generar número de factura automáticamente
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix VARCHAR(4);
    last_number INTEGER;
    new_number VARCHAR(50);
BEGIN
    year_prefix := TO_CHAR(NEW.issue_date, 'YYYY');
    
    -- Buscar el último número de factura del año
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0)
    INTO last_number
    FROM invoices
    WHERE invoice_number LIKE 'INV-' || year_prefix || '-%';
    
    -- Generar nuevo número
    new_number := 'INV-' || year_prefix || '-' || LPAD((last_number + 1)::TEXT, 6, '0');
    
    NEW.invoice_number := new_number;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_invoice_number_trigger
    BEFORE INSERT ON invoices
    FOR EACH ROW
    WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
    EXECUTE FUNCTION generate_invoice_number();

-- ============================================
-- FUNCIONES HELPER
-- ============================================

-- Función para obtener la tarifa aplicada (cascada)
CREATE OR REPLACE FUNCTION get_applied_rate(
    p_task_id UUID,
    p_project_id UUID,
    p_client_id UUID,
    p_default_rate DECIMAL DEFAULT NULL
)
RETURNS DECIMAL AS $$
DECLARE
    task_rate DECIMAL;
    project_rate DECIMAL;
    client_rate DECIMAL;
BEGIN
    -- Obtener tarifa de la tarea
    SELECT rate INTO task_rate FROM tasks WHERE id = p_task_id;
    
    IF task_rate IS NOT NULL THEN
        RETURN task_rate;
    END IF;
    
    -- Obtener tarifa del proyecto
    SELECT rate INTO project_rate FROM projects WHERE id = p_project_id;
    
    IF project_rate IS NOT NULL THEN
        RETURN project_rate;
    END IF;
    
    -- Obtener tarifa del cliente
    SELECT default_rate INTO client_rate FROM clients WHERE id = p_client_id;
    
    IF client_rate IS NOT NULL THEN
        RETURN client_rate;
    END IF;
    
    -- Retornar tarifa por defecto si se proporciona
    RETURN p_default_rate;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE hour_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLÍTICAS RLS PARA USUARIOS INTERNOS
-- ============================================

-- Clients: Los usuarios solo pueden ver/editar sus propios clientes
CREATE POLICY "Users can view their own clients"
    ON clients FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clients"
    ON clients FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
    ON clients FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients"
    ON clients FOR DELETE
    USING (auth.uid() = user_id);

-- Projects: Los usuarios pueden ver/editar proyectos de sus clientes
CREATE POLICY "Users can view projects of their clients"
    ON projects FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = projects.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert projects for their clients"
    ON projects FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = projects.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update projects of their clients"
    ON projects FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = projects.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete projects of their clients"
    ON projects FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = projects.client_id
            AND clients.user_id = auth.uid()
        )
    );

-- Tasks: Los usuarios pueden ver/editar tareas de sus proyectos
CREATE POLICY "Users can view tasks of their projects"
    ON tasks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM projects
            JOIN clients ON clients.id = projects.client_id
            WHERE projects.id = tasks.project_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert tasks for their projects"
    ON tasks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            JOIN clients ON clients.id = projects.client_id
            WHERE projects.id = tasks.project_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update tasks of their projects"
    ON tasks FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM projects
            JOIN clients ON clients.id = projects.client_id
            WHERE projects.id = tasks.project_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete tasks of their projects"
    ON tasks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM projects
            JOIN clients ON clients.id = projects.client_id
            WHERE projects.id = tasks.project_id
            AND clients.user_id = auth.uid()
        )
    );

-- Time Entries: Los usuarios solo pueden ver/editar sus propios períodos
CREATE POLICY "Users can view their own time entries"
    ON time_entries FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own time entries"
    ON time_entries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own time entries"
    ON time_entries FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own time entries"
    ON time_entries FOR DELETE
    USING (auth.uid() = user_id);

-- Hour Packages: Los usuarios pueden ver/editar paquetes de sus clientes
CREATE POLICY "Users can view hour packages of their clients"
    ON hour_packages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = hour_packages.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert hour packages for their clients"
    ON hour_packages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = hour_packages.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update hour packages of their clients"
    ON hour_packages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = hour_packages.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete hour packages of their clients"
    ON hour_packages FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = hour_packages.client_id
            AND clients.user_id = auth.uid()
        )
    );

-- Invoices: Los usuarios pueden ver/editar facturas de sus clientes
CREATE POLICY "Users can view invoices of their clients"
    ON invoices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = invoices.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert invoices for their clients"
    ON invoices FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = invoices.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update invoices of their clients"
    ON invoices FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = invoices.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete invoices of their clients"
    ON invoices FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = invoices.client_id
            AND clients.user_id = auth.uid()
        )
    );

-- Invoice Items: Los usuarios pueden ver/editar items de sus facturas
CREATE POLICY "Users can view invoice items of their invoices"
    ON invoice_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM invoices
            JOIN clients ON clients.id = invoices.client_id
            WHERE invoices.id = invoice_items.invoice_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert invoice items for their invoices"
    ON invoice_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM invoices
            JOIN clients ON clients.id = invoices.client_id
            WHERE invoices.id = invoice_items.invoice_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update invoice items of their invoices"
    ON invoice_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM invoices
            JOIN clients ON clients.id = invoices.client_id
            WHERE invoices.id = invoice_items.invoice_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete invoice items of their invoices"
    ON invoice_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM invoices
            JOIN clients ON clients.id = invoices.client_id
            WHERE invoices.id = invoice_items.invoice_id
            AND clients.user_id = auth.uid()
        )
    );

-- Client Users: Los usuarios pueden gestionar invitados de sus clientes
CREATE POLICY "Users can view client users of their clients"
    ON client_users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = client_users.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert client users for their clients"
    ON client_users FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = client_users.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update client users of their clients"
    ON client_users FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = client_users.client_id
            AND clients.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete client users of their clients"
    ON client_users FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = client_users.client_id
            AND clients.user_id = auth.uid()
        )
    );

-- ============================================
-- POLÍTICAS RLS PARA CLIENTES INVITADOS (PORTAL)
-- ============================================

-- Los clientes invitados solo pueden ver datos de su cliente asignado
-- (solo lectura, sin permisos de escritura)

CREATE POLICY "Client users can view their client data"
    ON clients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM client_users
            WHERE client_users.client_id = clients.id
            AND client_users.user_id = auth.uid()
        )
    );

CREATE POLICY "Client users can view projects of their client"
    ON projects FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM client_users
            WHERE client_users.client_id = projects.client_id
            AND client_users.user_id = auth.uid()
        )
    );

CREATE POLICY "Client users can view tasks of their client projects"
    ON tasks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM projects
            JOIN client_users ON client_users.client_id = projects.client_id
            WHERE projects.id = tasks.project_id
            AND client_users.user_id = auth.uid()
        )
    );

CREATE POLICY "Client users can view time entries of their client"
    ON time_entries FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tasks
            JOIN projects ON projects.id = tasks.project_id
            JOIN client_users ON client_users.client_id = projects.client_id
            WHERE tasks.id = time_entries.task_id
            AND client_users.user_id = auth.uid()
        )
    );

CREATE POLICY "Client users can view invoices of their client"
    ON invoices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM client_users
            WHERE client_users.client_id = invoices.client_id
            AND client_users.user_id = auth.uid()
        )
    );

CREATE POLICY "Client users can view invoice items of their client invoices"
    ON invoice_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM invoices
            JOIN client_users ON client_users.client_id = invoices.client_id
            WHERE invoices.id = invoice_items.invoice_id
            AND client_users.user_id = auth.uid()
        )
    );

CREATE POLICY "Client users can view hour packages of their client"
    ON hour_packages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM client_users
            WHERE client_users.client_id = hour_packages.client_id
            AND client_users.user_id = auth.uid()
        )
    );

-- ============================================
-- COMENTARIOS EN TABLAS Y COLUMNAS
-- ============================================

COMMENT ON TABLE clients IS 'Clientes del sistema';
COMMENT ON TABLE projects IS 'Proyectos asociados a clientes';
COMMENT ON TABLE tasks IS 'Tareas dentro de proyectos';
COMMENT ON TABLE time_entries IS 'Períodos de trabajo registrados';
COMMENT ON TABLE hour_packages IS 'Paquetes de horas precompradas';
COMMENT ON TABLE invoices IS 'Facturas generadas';
COMMENT ON TABLE invoice_items IS 'Items individuales de facturas';
COMMENT ON TABLE client_users IS 'Usuarios invitados para portal de clientes';

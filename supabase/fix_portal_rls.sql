-- 1. Habilitar RLS en las tablas principales
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas existentes (opcional, para evitar duplicados)
DROP POLICY IF EXISTS "Los clientes pueden ver su propio registro" ON clients;
DROP POLICY IF EXISTS "Los clientes pueden ver sus proyectos" ON projects;
DROP POLICY IF EXISTS "Los clientes pueden ver sus tareas" ON tasks;
DROP POLICY IF EXISTS "Los clientes pueden ver sus registros de tiempo" ON time_entries;
DROP POLICY IF EXISTS "Los clientes pueden ver sus facturas" ON invoices;
DROP POLICY IF EXISTS "Los usuarios vinculados pueden ver su cliente" ON client_users;

-- 3. Políticas para el Usuario de Portal (portal_user_id directo en clients)

-- CLIENTS: Ver mi propio perfil
CREATE POLICY "Los clientes pueden ver su propio registro" ON clients
FOR SELECT USING (
    portal_user_id = auth.uid() OR 
    user_id = auth.uid() -- El admin también ve sus clientes
);

-- PROJECTS: Ver proyectos de mi cliente
CREATE POLICY "Los clientes pueden ver sus proyectos" ON projects
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM clients 
        WHERE clients.id = projects.client_id 
        AND (clients.portal_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
);

-- TASKS: Ver tareas de mis proyectos
CREATE POLICY "Los clientes pueden ver sus tareas" ON tasks
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM projects
        JOIN clients ON clients.id = projects.client_id
        WHERE projects.id = tasks.project_id
        AND (clients.portal_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
);

-- TIME ENTRIES: Ver registros de mis tareas
CREATE POLICY "Los clientes pueden ver sus registros de tiempo" ON time_entries
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        JOIN clients ON clients.id = projects.client_id
        WHERE tasks.id = time_entries.task_id
        AND (clients.portal_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
);

-- INVOICES: Ver mis facturas
CREATE POLICY "Los clientes pueden ver sus facturas" ON invoices
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM clients
        WHERE clients.id = invoices.client_id
        AND (clients.portal_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
);

-- 4. Soporte para client_users (accesos delegados)

CREATE POLICY "Los usuarios vinculados pueden ver su cliente" ON client_users
FOR SELECT USING (
    user_id = auth.uid()
);

-- Ajustar políticas anteriores para incluir client_users
ALTER POLICY "Los clientes pueden ver su propio registro" ON clients 
USING (
    portal_user_id = auth.uid() OR 
    user_id = auth.uid() OR
    id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
);

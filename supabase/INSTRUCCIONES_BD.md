# Instrucciones para Implementar la Base de Datos en Supabase

Este documento contiene las instrucciones paso a paso para implementar el esquema de base de datos del Sistema de Gestión de Tiempos en Supabase.

## 📋 Prerrequisitos

1. Tener una cuenta en [Supabase](https://supabase.com)
2. Haber creado un proyecto en Supabase
3. Tener acceso al SQL Editor de Supabase

## 🚀 Pasos para Implementar

### Paso 1: Acceder al SQL Editor

1. Inicia sesión en tu cuenta de Supabase
2. Selecciona tu proyecto
3. En el menú lateral, ve a **SQL Editor**
4. Haz clic en **New Query** para crear una nueva consulta

### Paso 2: Ejecutar el Script de Migración

1. Abre el archivo `supabase/migrations/001_initial_schema.sql`
2. Copia **todo el contenido** del archivo
3. Pega el contenido en el SQL Editor de Supabase
4. Haz clic en **Run** o presiona `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)

### Paso 3: Verificar la Ejecución

El script debería ejecutarse sin errores. Verifica que:

- ✅ No aparezcan errores en rojo
- ✅ Aparezca el mensaje "Success. No rows returned"
- ✅ Todas las tablas se hayan creado correctamente

### Paso 4: Verificar las Tablas Creadas

1. En el menú lateral, ve a **Table Editor**
2. Deberías ver las siguientes tablas:
   - `clients`
   - `projects`
   - `tasks`
   - `time_entries`
   - `hour_packages`
   - `invoices`
   - `invoice_items`
   - `client_users`

### Paso 5: Verificar las Políticas RLS

1. Ve a **Authentication** > **Policies** en el menú lateral
2. O en **Table Editor**, selecciona cualquier tabla y ve a la pestaña **Policies**
3. Deberías ver políticas creadas para cada tabla

## 🔍 Verificación Adicional

### Verificar Extensiones

Ejecuta esta consulta para verificar que las extensiones estén habilitadas:

```sql
SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';
```

### Verificar Tipos ENUM

Ejecuta esta consulta para verificar los tipos ENUM creados:

```sql
SELECT typname FROM pg_type WHERE typtype = 'e' 
ORDER BY typname;
```

Deberías ver:
- `billing_type`
- `project_status`
- `invoice_status`
- `invoice_item_type`
- `access_level`

### Verificar Funciones

Ejecuta esta consulta para verificar las funciones creadas:

```sql
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public'
ORDER BY routine_name;
```

Deberías ver:
- `update_updated_at_column()`
- `calculate_time_entry_duration()`
- `generate_invoice_number()`
- `get_applied_rate()`

### Verificar Triggers

Ejecuta esta consulta para verificar los triggers:

```sql
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
```

## 🧪 Pruebas Básicas

### Test 1: Crear un Cliente de Prueba

**Nota**: Necesitarás un usuario autenticado primero. Esto se hará desde la aplicación.

Por ahora, puedes verificar que la estructura esté correcta:

```sql
-- Ver estructura de la tabla clients
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'clients'
ORDER BY ordinal_position;
```

### Test 2: Verificar Relaciones

```sql
-- Ver todas las foreign keys
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;
```

### Test 3: Verificar Índices

```sql
-- Ver todos los índices creados
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

## 🔐 Configuración de Autenticación

### Habilitar Email/Password Authentication

1. Ve a **Authentication** > **Providers** en el menú lateral
2. Asegúrate de que **Email** esté habilitado
3. Configura las opciones según tus necesidades:
   - **Enable email confirmations**: Recomendado para producción
   - **Secure email change**: Recomendado activarlo

### Configurar URLs de Redirección

1. Ve a **Authentication** > **URL Configuration**
2. Configura:
   - **Site URL**: Tu URL de producción (ej: `https://tu-app.vercel.app`)
   - **Redirect URLs**: Agrega las URLs permitidas:
     - `http://localhost:3000/**` (desarrollo)
     - `https://tu-app.vercel.app/**` (producción)

## 📊 Estructura de la Base de Datos

### Relaciones Principales

```
auth.users
    └── clients (user_id)
            ├── projects (client_id)
            │       └── tasks (project_id)
            │               └── time_entries (task_id)
            ├── hour_packages (client_id)
            ├── invoices (client_id)
            │       └── invoice_items (invoice_id)
            └── client_users (client_id)
                    └── auth.users (user_id)
```

### Flujo de Tarifas en Cascada

La función `get_applied_rate()` resuelve las tarifas en este orden:

1. **Tarea** (`tasks.rate`)
2. **Proyecto** (`projects.rate`)
3. **Cliente** (`clients.default_rate`)
4. **Tarifa General** (parámetro por defecto)

## 🛠️ Troubleshooting

### Error: "extension uuid-ossp does not exist"

**Solución**: El script ya incluye `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`. Si aún así falla, ejecuta manualmente:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Error: "permission denied"

**Solución**: Asegúrate de tener permisos de administrador en el proyecto de Supabase. Si estás en el plan gratuito, deberías tener todos los permisos necesarios.

### Error al crear políticas RLS

**Solución**: Verifica que RLS esté habilitado. El script lo hace automáticamente, pero puedes verificar:

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

### Las políticas no funcionan

**Solución**: 
1. Verifica que el usuario esté autenticado correctamente
2. Revisa que las políticas estén activas en la tabla
3. Verifica que el `auth.uid()` retorne el ID correcto del usuario

## 📝 Notas Importantes

1. **Backup**: Antes de ejecutar el script en producción, asegúrate de tener un backup de tu base de datos.

2. **Migraciones Futuras**: Para futuras modificaciones, crea nuevos archivos de migración numerados secuencialmente (002_xxx.sql, 003_xxx.sql, etc.)

3. **Variables de Entorno**: Una vez implementada la BD, necesitarás las credenciales de Supabase para conectarte desde Next.js:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo para operaciones del servidor)

4. **Testing**: Después de implementar, prueba crear un usuario desde la aplicación y verificar que las políticas RLS funcionen correctamente.

## ✅ Checklist Final

- [ ] Script ejecutado sin errores
- [ ] Todas las tablas creadas
- [ ] Todos los tipos ENUM creados
- [ ] Todas las funciones creadas
- [ ] Todos los triggers creados
- [ ] Todas las políticas RLS creadas
- [ ] Índices verificados
- [ ] Relaciones (foreign keys) verificadas
- [ ] Autenticación configurada
- [ ] URLs de redirección configuradas

## 🎉 Siguiente Paso

Una vez completada la implementación de la base de datos, puedes proceder con:
1. Configuración del proyecto Next.js
2. Integración con Supabase Client
3. Implementación de autenticación
4. Desarrollo de los CRUDs

---

**¿Problemas?** Revisa la sección de Troubleshooting o consulta la [documentación de Supabase](https://supabase.com/docs).

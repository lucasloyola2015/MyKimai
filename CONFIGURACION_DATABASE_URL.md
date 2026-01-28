# Configuración de DATABASE_URL para Prisma con Supabase

Prisma necesita la variable `DATABASE_URL` para conectarse a tu base de datos de Supabase.

## ⚠️ IMPORTANTE: Usar Connection Pooler para Next.js

Para aplicaciones Next.js (serverless), **debes usar el Connection Pooler** de Supabase, NO la conexión directa.

## Cómo obtener tu DATABASE_URL (Connection Pooler)

1. Ve a tu proyecto en Supabase: https://supabase.com/dashboard/project/zislzwzypzrzhgnzbnsv
2. Ve a **Settings** > **Database**
3. Busca la sección **Connection string**
4. Selecciona **Transaction mode** (puerto 6543) o **Session mode** (puerto 5432)
5. Copia la cadena de conexión que tiene el formato:
   ```
   postgresql://postgres.zislzwzypzrzhgnzbnsv:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
   O para Session mode:
   ```
   postgresql://postgres.zislzwzypzrzhgnzbnsv:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
   ```
6. Reemplaza `[YOUR-PASSWORD]` con tu contraseña de base de datos de Supabase
   - Si no recuerdas tu contraseña, puedes resetearla en Settings > Database > Database password
7. Reemplaza `[REGION]` con tu región de AWS (ej: `us-east-1`, `eu-west-1`, etc.)
   - La región aparece en la URL del pooler que te da Supabase

## Agregar a .env.local

Agrega esta línea a tu archivo `.env.local`:

**Para Transaction mode (recomendado para serverless):**
```env
DATABASE_URL=postgresql://postgres.zislzwzypzrzhgnzbnsv:TU_CONTRASEÑA@aws-0-TU_REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

**Para Session mode (alternativa):**
```env
DATABASE_URL=postgresql://postgres.zislzwzypzrzhgnzbnsv:TU_CONTRASEÑA@aws-0-TU_REGION.pooler.supabase.com:5432/postgres?sslmode=require
```

**⚠️ IMPORTANTE**: 
- Reemplaza `TU_CONTRASEÑA` con tu contraseña real
- Reemplaza `TU_REGION` con tu región de AWS (ej: `us-east-1`)
- URL-encode la contraseña si contiene caracteres especiales (ej: `@` se convierte en `%40`)
- Nunca subas `.env.local` al repositorio

## Verificación

Después de agregar `DATABASE_URL`, reinicia el servidor de desarrollo:

```bash
npm run dev
```

Si todo está correcto, Prisma debería poder conectarse a la base de datos.

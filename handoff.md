# Handoff — MyKimai

> Foto de la última sesión para retomar sin contexto previo. Leer junto con `CLAUDE.md`.
> **Fecha:** 2026-06-26 · **Sesión:** **Análisis de diseño + hardening + features grandes**
> (seguridad/IDOR/RLS, timers en paralelo, consumo real de paquetes de horas, timezone AR,
> migración de páginas a Server Actions, tests, y cierre de pendientes). **Todo está en `main`,
> pusheado a `origin` y desplegado en Vercel. Las 8 migraciones SQL de la sesión ya se aplicaron
> y verificaron en Supabase.** Roadmap original en [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md);
> análisis de diseño nuevo en [`ANALISIS_DISENO_2026-06.md`](ANALISIS_DISENO_2026-06.md). Se
> regenera con **`/handoff`**.

---

## 1. Estado actual — qué está VIVO y DÓNDE

### Git / Deploy
- **`main`** en **`3bcd923`** (`refactor(errors): helper safeActionError`).
- ✅ **`main` == `origin/main` (en sync).** Todo pusheado → **Vercel desplegó** (verificar "Ready"
  en el dashboard de Vercel; no hay acceso a la API de Vercel desde el agente).
- Working tree limpio. **Sin migraciones SQL pendientes.**
- 🧹 **Pendiente menor:** queda la rama/worktree vieja `claude/xenodochial-cannon-fca96b`
  (`git worktree list` para ver; `git worktree remove ...` / `git branch -D` para limpiar).

### Deploy (Vercel)
- Framework Next.js (`vercel.json`). Deploy automático en cada push a `main`.
- Portal de cliente en **`jobs.loyola.com.ar`**.
- ⚠️ **El deploy NO aplica migraciones SQL.** Se aplican a mano en el SQL Editor de Supabase
  (ver Runbook). En esta sesión ya están todas aplicadas.

### Base de datos (Supabase) — ✅ TODAS LAS MIGRACIONES APLICADAS Y VERIFICADAS (2026-06-26)
Las 8 migraciones de la sesión están en `supabase/migrations/` y aplicadas en producción:
- `2026-06-26_fiscal_fk_restrict_and_checks.sql` — `invoices.client_id`→RESTRICT + CHECK constraints.
- `2026-06-26_time_entry_triggers.sql` — triggers de duración/monto **versionados** + fix de pausas
  solapadas (clamp/merge) + rama ELSE del monto.
- `2026-06-26_active_timer_unique_indexes.sql` — (luego reemplazado en parte por el de abajo).
- `2026-06-26_parallel_timers.sql` — dropea `uniq_active_timer_per_user`, crea
  `uniq_active_timer_per_user_task` (timers en paralelo: 1 por (usuario,tarea)).
- `2026-06-26_fix_rls_recursion.sql` — rompe la **recursión infinita** de RLS (projects⇄project_access)
  con funciones `SECURITY DEFINER` (`rls_client_user_sees_project`/`_task`).
- `2026-06-26_hour_package_consumption.sql` — `time_entries.consumed_from_package_id` (FK SET NULL) +
  `hours_used` derivado por trigger.
- (más las 5 de la sesión anterior: índices F1.7, team_members, RLS extension, project_access, milestones.)

**Verificación rápida (read-only) — patrón usado en la sesión:** correr un script Node temporal que
cargue `.env.local` y consulte la DB con `pg` directo (NO el cliente Prisma extendido):
```js
// _verify_tmp.mjs (en la raíz del repo, borrar después)
import * as dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized:false }, max:1 });
console.log((await pool.query("SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uniq_active_%'")).rows);
await pool.end();
```
`node _verify_tmp.mjs` (correrlo desde la raíz para que resuelva `node_modules`). Para probar RLS se
puede impersonar al usuario: `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}',true);`
dentro de una transacción revertida.

### RLS — recursión corregida
Antes, leer `time_entries`/`projects` con el **cliente anon de Supabase** tiraba *"infinite recursion
detected in policy for relation projects"* (introducida por F4). Resuelto con funciones SECURITY DEFINER.
**Recordá la Regla de Oro #1:** Prisma (`DATABASE_URL`) **bypasea la RLS** → el filtrado por `ownerId` /
portal scope en las Server Actions es la **primera** línea de defensa.

### Credenciales (UBICACIÓN — nunca el valor)
- **`.env.local`** (raíz, no versionado): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/admin.ts`), `DATABASE_URL` (Prisma), `AFIP_*`. Plantilla:
  `.env.example`. **Vercel:** las mismas variables en el dashboard del proyecto.

---

## 2. Logros de esta sesión

> Análisis completo en [`ANALISIS_DISENO_2026-06.md`](ANALISIS_DISENO_2026-06.md) (fallas/mejoras
> verificadas por severidad). Todo lo de abajo está commiteado en `main` y desplegado.

- **Seguridad / multi-tenancy (hardening):** cerrados IDOR cross-tenant — `getTimeEntries` (el portal ya
  no acepta `clientId` del request), acciones AFIP (`generateFiscalInvoice`/`generateCreditNote` exigen
  ownership), `calculateEntryAmount`, `getPortalUnbilledSummary`/reportes del portal (respetan
  `project_access`), `getClientBranding`. Validación zod en payments/clients/projects/tasks. `deleteClient`
  no borra cliente con facturas. Numeración de factura scopeada por owner. (Migración FK RESTRICT + CHECKs.)
- **Recibos / facturación:** `recordPayment` con validación + recálculo en transacción + guard de sobre-pago
  + `deletePayment`. PDFs: borradas 2 plantillas react-pdf muertas (riesgo de INTERNAL como factura fiscal
  falsa), tablas DUPLICADO/TRIPLICADO alineadas, "Período Hasta" usa `end_time`, `@react-pdf` diferido.
  Estado de factura: `paid_at` consistente + "Vencida" derivada de `due_date` en el listado.
- **Timers en paralelo (feature):** múltiples tareas corriendo a la vez. Panel **"Tareas activas"** en
  Dashboard y Time Tracker con play/pausa/stop por tarea + diálogo de edición (descansos + comentario).
  Botón **"NUEVA"** en el TopBar. (`components/dashboard/active-tasks-panel.tsx`, `getActiveTimeEntries`,
  context reescrito.)
- **Consumo real de paquetes de horas (feature, §4.3):** `time_entries.consumed_from_package_id` +
  `hours_used` derivado por trigger. Auto-asignación FIFO al frenar + override manual en Mis Horas. Las
  horas cubiertas por paquete se **excluyen** de la factura por hora. (`lib/actions/hour-packages.ts`,
  `lib/actions/time-entries.ts`.)
- **Gráfico "Horas Trabajadas":** estaba vacío por la recursión RLS → migrado a Server Action
  (`getActorChartEntries`, Prisma, inmune a RLS).
- **Timezone Argentina:** nuevo `lib/timezone.ts` (date-fns-tz). Reportes/stats/portal agrupan por
  día/semana/mes en hora AR (el trabajo nocturno ya no cae en el día siguiente).
- **Páginas anon → Server Actions:** Proyectos, Paquetes de horas e Importar-Kimai pasan de supabase-js
  (anon+RLS) a Prisma+ownerId. **Eliminado `lib/types/database.ts`** (tipos a mano stale).
- **Tests:** `vitest` configurado, `npm test` con **23 tests** de dinero/fechas
  (`resolveRate`, duración, timezone). `lib/**/*.test.ts`.
- **Errores:** helper `safeActionError` (no filtra internals de Prisma) en el core CRUD.

---

## 3. Pendientes y bloqueantes (por prioridad)

1. **Onboarding real (negocio):** invitar a **Lucio** y **Antonela** como team_members desde
   `/dashboard/settings/team`. Configurar stakeholders de **Illinois** (Jeremías → Odoo, Agustín →
   robots) en `/dashboard/projects/[id]/stakeholders` (`sees_all_projects = false`). Crear los
   **paquetes de horas** de Illinois ahora que el consumo funciona de verdad.
2. **🏗️ Capa de dominio / RLS-real para Prisma** (estratégico, el verdadero próximo proyecto): hoy el
   tenant-scoping es manual en cada Server Action (un olvido = fuga). Pasar a guards obligatorios y/o
   un rol Postgres no privilegiado para Prisma que respete RLS. Ver `ANALISIS_DISENO_2026-06.md` §10 (R1).
3. **Rollout de `safeActionError`** al resto de actions (milestones, project-access, team-members,
   time-entries) — mecánico, el patrón ya está en `lib/validations/utils.ts`.
4. **Paginación** de Facturas/Reportes (menor; Mis Horas ya tiene ventana de 90 días).
5. **No recomendado como churn:** split de `time-entries.ts` (38KB) / `invoices.ts` (27KB). Es
   reorganización pura de código de plata con cobertura de tests parcial → hacerlo incremental y con
   cuidado (extraer helpers puros primero), no de un saque.
6. **Limpiar** el worktree/rama `claude/xenodochial-cannon-fca96b`.

---

## 4. Runbook — cómo hacer las cosas

### Desarrollo
```bash
npm run dev            # localhost:3000
npm run build          # build de producción (gate real; corre lint + typecheck)
npx tsc --noEmit       # typecheck (EXIT 0 antes de commitear)
npm test               # vitest (23 tests de dinero/fechas)  ·  npm run test:watch
npx prisma generate    # regenerar cliente Prisma tras tocar schema.prisma
```

### Aplicar una migración SQL (manual, Supabase)
1. Supabase dashboard → proyecto MyKimai → **SQL Editor → New query**.
2. Pegar el contenido del `.sql` (`supabase/migrations/`) y Run. Son idempotentes.
3. ⚠️ El SQL Editor corre en transacción → **nada de `CREATE INDEX CONCURRENTLY`** (usar `CREATE INDEX`).
4. Verificar con el patrón de script Node de la §1, o con el bloque comentado al final de cada `.sql`.

### Publicar a producción
```bash
git push origin main          # dispara el deploy de Vercel
# Si la feature depende de una migración nueva: aplicarla en Supabase ANTES del push
# (cuando el código referencia columnas/funciones nuevas, p.ej. consumed_from_package_id).
```

### Flujo git de la sesión (worktree NO; ramas simples)
```bash
git checkout -b fix/<algo>     # SIEMPRE branquear (no trabajar directo en main)
# ...editar... ; npx tsc --noEmit && npm run build && npm test
git add -A && git commit       # mensaje claro; terminar con Co-Authored-By
git checkout main && git merge --ff-only fix/<algo>
git push origin main
git branch -d fix/<algo>
```

### Cerrar una sesión
Correr **`/handoff`** → revisar `handoff.md` → `/clear`. En la sesión nueva: *"leé el handoff"*.

---

## 5. Decisiones clave

- **Prisma bypasea RLS** → filtrado por `ownerId`/portal en código = primera defensa; RLS = defensa en
  profundidad (y debe romper recursión con SECURITY DEFINER, no subqueries inline). Ver
  `ANALISIS_DISENO_2026-06.md` §2 y la migración `fix_rls_recursion`.
- **Timers en paralelo:** 1 timer activo **por (usuario, tarea)** (no por usuario). Índice único parcial.
- **Paquetes de horas:** consumo **auto al frenar (FIFO) + override manual**; las horas cubiertas
  **se excluyen** de la factura por hora; `hours_used` es **derivado por trigger** (no se escribe a mano).
- **Estado de factura: flexible** (se puede marcar 'pagada' a mano) pero consistente (`paid_at` se
  limpia al salir de 'paid'; 'Vencida' se calcula por `due_date` en display).
- **Timezone:** todo el bucketing de reportes en `America/Argentina/Buenos_Aires` (UTC-3) vía
  `lib/timezone.ts`.
- **Migraciones manuales** en el SQL Editor (no `prisma migrate`); duración en **minutos** (SSOT en triggers).

## Mapa de documentación / código
- **Análisis nuevo:** `ANALISIS_DISENO_2026-06.md`. **Roadmap original:** `IMPROVEMENT_PLAN.md` (F0..F10).
  **Historial:** `CHANGELOG.md`. **Marca:** `BRANDING.md`. **Contexto durable:** `CLAUDE.md`.
- **Auth/contexto:** `lib/auth/owner-context.ts` (provider) · `lib/auth/portal-context.ts` (cliente) ·
  `lib/auth/server.ts`.
- **Server Actions:** `lib/actions/` · **Validaciones:** `lib/validations/` (incl. `utils.ts`:
  `zodErrorMessage`, `safeActionError`) · **Migraciones:** `supabase/migrations/` · **TZ:** `lib/timezone.ts`
  · **Tests:** `lib/**/*.test.ts` (vitest).

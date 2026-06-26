# Handoff — MyKimai

> Foto de la última sesión para retomar sin contexto previo. Leer junto con `CLAUDE.md`.
> **Fecha:** 2026-06-26 · **Sesión:** **MyKimai 2.0 — F0 a F5 implementadas y mergeadas a `main`.**
> Hotfixes de producción, cleanup técnico, multi-user del lado del proveedor (team_members),
> multi-stakeholder del lado del cliente (project_access) y hitos/milestones. **Todo el código está
> en `main`; faltan aplicar 4 migraciones SQL en Supabase.** Roadmap completo en
> [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md); historial en [`CHANGELOG.md`](CHANGELOG.md).
> Se regenera con el comando **`/handoff`**.

---

## 1. Estado actual — qué está VIVO y DÓNDE

### Git
- **`main`** en `979c359` (`feat(F5): hitos / milestones`). Las fases F0..F5 se mergearon por
  **fast-forward** desde la rama `claude/xenodochial-cannon-fca96b` (8 commits nuevos).
- **No hay nada sin commitear** en `main` salvo `.claude/` (worktrees locales) e ítems ignorados.
- **Worktree de la sesión:** `.claude/worktrees/xenodochial-cannon-fca96b/` (rama
  `claude/xenodochial-cannon-fca96b`). Ya está mergeado a `main`; se puede limpiar.
- **Sin pushear:** `main` local está adelante del remoto si no se corrió `git push origin main`.

### Deploy (Vercel)
- Framework Next.js (`vercel.json` = `{ "framework": "nextjs" }`). Deploy automático en cada push
  de la rama conectada.
- Portal de cliente en **`jobs.loyola.com.ar`**.
- ⚠️ Si querés que F0..F5 estén en producción web, hay que **pushear `main`** (`git push origin main`)
  y esperar el deploy de Vercel. **Pero el deploy NO aplica las migraciones SQL** (ver abajo).

### Base de datos (Supabase) — 🔴 4 MIGRACIONES PENDIENTES
El código de F2/F4/F5 espera tablas/columnas que **todavía no existen** en la DB hasta aplicar el
SQL. Aplicar en el **SQL Editor de Supabase**, en este orden:

1. `supabase/migrations/2026-05-11_team_members.sql` — F2: tabla `team_members` + enum `team_role` + RLS propia.
2. `supabase/migrations/2026-05-11_team_members_rls_extension.sql` — F2: extiende RLS de clients/projects/tasks/time_entries/invoices/payments para team_members.
3. `supabase/migrations/2026-05-11_project_access.sql` — F4: tabla `project_access` + `client_users.sees_all_projects` + `hour_packages.reserved_for_client_user_id` + reemplazo de policies SELECT del portal.
4. `supabase/migrations/2026-05-11_milestones.sql` — F5: tabla `milestones` + enum `milestone_status` + `time_entries.milestone_id` + RLS.

**Ya aplicada:** `supabase/migrations/2026-05-11_add_performance_indexes.sql` (F1.7). Cada `.sql`
es idempotente (`IF NOT EXISTS` / `DO $$ … EXCEPTION WHEN duplicate_object`) y trae al final un
bloque comentado con queries de verificación.

### RLS — auditada (F0 §3.4)
Las 11 tablas críticas tienen RLS activa con policies por `auth.uid()`. **Importante:** Prisma se
conecta con `DATABASE_URL` (rol con privilegios) y **BYPASEA la RLS** → el filtrado por `ownerId`
y por scope de portal en el código (Server Actions) es la **primera** línea de defensa; la RLS es
defensa en profundidad para accesos vía supabase-js / portal.

### Credenciales (UBICACIÓN — nunca el valor)
- **`.env.local`** (raíz, NO versionado): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (usada por `lib/supabase/admin.ts` para crear usuarios de Auth),
  `DATABASE_URL` (Prisma), y config AFIP (`AFIP_*`, certificados en base64).
- **Vercel:** las mismas variables de entorno en el dashboard del proyecto.
- Plantilla de referencia: `.env.example`.

---

## 2. Logros de esta sesión

> Detalle por fase en `IMPROVEMENT_PLAN.md` (cada sección tiene su bloque de estado 🟡/✅).

- **F0 — Hotfixes producción** (`2260cb3`, `83745f1`): fix privacy del dashboard (`getDashboardStats`
  filtra por user + separa ingresos por moneda), enums PascalCase duplicados eliminados del schema,
  idempotencia AFIP (advisory lock + `updateMany WHERE cae IS NULL`), **RLS auditada** (§3.4 cerrado).
- **F1 — Cleanup** (`a23bcb5`, `6401a59`, `747174d`): `lib/utils/duration.ts` (unidad = minutos),
  índices de performance (aplicados), validación zod en Server Actions críticas
  (`lib/validations/*`), limpieza de artifacts del root + `.gitignore`.
- **F2 — Multi-user provider** (`d9b59dd`): modelo `team_members` + `lib/auth/owner-context.ts`
  (`getOwnerContext`, `canManageWorkspace`, `canSeeFinancials`). Refactor de clients/projects/tasks/
  time-entries/invoices/payments/reports/stats para filtrar por `ownerId`. Collaborator NO ve
  invoices; admin sí.
- **F3 — Onboarding UI** (`343b765`): `/dashboard/settings/team` para invitar/editar/quitar
  team_members (`lib/actions/team-members.ts`, crea usuario en Supabase Auth si no existe).
- **F4 — Multi-stakeholder cliente** (`857f9d2`): `project_access` + `sees_all_projects`,
  `lib/auth/portal-context.ts` (`getPortalProjectFilter`), refactor de queries del portal,
  validación que prohíbe invoice multi-proyecto con stakeholders distintos, UI
  `/dashboard/projects/[id]/stakeholders`.
- **F5 — Hitos/milestones** (`979c359`): `milestones` + `time_entries.milestone_id`,
  `lib/actions/milestones.ts`, UI admin `/dashboard/projects/[id]/milestones` y panel en el portal
  cliente (`<MilestonesPanel>`) con barras de progreso.
- **Infra de sesión:** este `handoff.md` + comando `/handoff` (`.claude/commands/handoff.md`) +
  `CLAUDE.md`, replicando el patrón de HermesAgent.

---

## 3. Pendientes y bloqueantes (por prioridad)

1. **🔴 Aplicar las 4 migraciones SQL en Supabase** (orden en §1). Sin esto, F2/F4/F5 fallan en runtime.
2. **Pushear `main`** a remoto y verificar el deploy en Vercel (si se quiere F0..F5 en producción).
3. **Onboarding real:** una vez migrada la DB, invitar a **Lucio** y **Antonela** como team_members
   desde `/dashboard/settings/team`. Configurar stakeholders de **Illinois** (Jeremías → Odoo,
   Agustín → robots) en `/dashboard/projects/[id]/stakeholders` (marcar `sees_all_projects = false`).
4. **Limpiar el worktree** `.claude/worktrees/xenodochial-cannon-fca96b/` si ya no se usa.
5. **Fases siguientes (no empezadas):** F6 currency en payments/invoices, F7 soft-delete, F8 tests
   críticos, F9 hour_packages atómicos, F10 UI/UX y comunicación (email de facturas). Ver
   `IMPROVEMENT_PLAN.md` §8/§9.

---

## 4. Runbook — cómo hacer las cosas

### Desarrollo
```bash
npm run dev            # levantar en localhost:3000
npm run build          # build de producción
npx tsc --noEmit       # typecheck (debe dar EXIT 0 antes de commitear)
npx prisma generate    # regenerar el cliente Prisma tras tocar schema.prisma
```

### Aplicar una migración SQL (manual, Supabase)
1. Supabase dashboard → proyecto MyKimai → **SQL Editor → New query**.
2. Abrir el archivo `.sql` bajo `supabase/migrations/` y **pegar el contenido completo**.
3. Run. Aplicar en el orden indicado en §1 (el #2 depende del #1).
4. ⚠️ El SQL Editor envuelve cada query en una transacción → **no** usar `CREATE INDEX CONCURRENTLY`
   (da error 25001). Usar `CREATE INDEX` normal.
5. Verificar con el bloque comentado al final de cada `.sql`.

### Auditar RLS (read-only)
```sql
-- Tablas con RLS activa
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- Policies por tabla
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd;
```

### Git con worktrees (cómo se trabajó esta sesión)
```bash
git worktree list                                  # ver worktrees activos
git log --oneline -10                              # historial
git merge --ff-only claude/<rama>                  # mergear la rama del worktree a main (fast-forward)
git push origin main                               # publicar (dispara deploy de Vercel)
```

### Antes de mergear/cerrar
- `npx tsc --noEmit` en EXIT 0.
- Si se tocó `schema.prisma`: `npx prisma generate` + crear el `.sql` correspondiente en
  `supabase/migrations/` (este proyecto NO usa `prisma migrate`; las migraciones se aplican a mano).

---

## 5. Decisiones clave

- **Prisma vía `DATABASE_URL` bypasea RLS** → el filtrado por `ownerId`/portal en el código es la
  primera línea de defensa; la RLS es defensa en profundidad. (Ver `IMPROVEMENT_PLAN.md` §3.4, F4.)
- **Multi-user = "Owner + Team Members" (Opción B)**, no workspaces/orgs. Lucas es el único owner
  comercial; Lucio/Antonela cargan horas bajo su workspace. (`IMPROVEMENT_PLAN.md` §5.)
- **Visibilidad de cliente granular por proyecto** vía `project_access` + flag `sees_all_projects`
  (default `true` para no romper clientes legacy). Invoice multi-proyecto con stakeholders distintos
  está **prohibida** al crear. (`IMPROVEMENT_PLAN.md` §6.)
- **Migraciones manuales en el SQL Editor** (no `prisma migrate`); `CREATE INDEX` sin `CONCURRENTLY`.
- **Duración en minutos** como unidad canónica (`lib/utils/duration.ts`); el cálculo de horas netas
  vive en triggers de la DB (SSOT). (`CHANGELOG.md` Harden Finance / migrate-duration-neto.)

## Mapa de documentación / código
- **Roadmap y diseño:** `IMPROVEMENT_PLAN.md` (F0..F10, schema diffs, RLS guidelines, tests).
- **Historial:** `CHANGELOG.md`. **Marca/estética:** `BRANDING.md`.
- **Auth/contexto:** `lib/auth/owner-context.ts` (provider) · `lib/auth/portal-context.ts` (cliente)
  · `lib/auth/server.ts` (`getAuthUser`, `getClientContext`).
- **Server Actions:** `lib/actions/` (clients, projects, tasks, time-entries, invoices, payments,
  reports, stats, team-members, project-access, milestones, afip-actions).
- **Validaciones:** `lib/validations/`. **Migraciones:** `supabase/migrations/`.

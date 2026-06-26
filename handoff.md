# Handoff — MyKimai

> Foto de la última sesión para retomar sin contexto previo. Leer junto con `CLAUDE.md`.
> **Fecha:** 2026-06-26 · **Sesión:** **MyKimai 2.0 (F0–F5) mergeado a `main` + sistema de handoff.**
> Hotfixes de producción, cleanup, multi-user proveedor (team_members), multi-stakeholder cliente
> (project_access), hitos/milestones, y el comando `/handoff`. **Todo el código está en `main` y las
> 4 migraciones SQL ya se aplicaron en Supabase (2026-06-26).** Falta `git push origin main`
> (11 commits adelante de `origin` → Vercel aún no lo desplegó). Roadmap en
> [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md); historial en [`CHANGELOG.md`](CHANGELOG.md).
> Se regenera con **`/handoff`**.

---

## 1. Estado actual — qué está VIVO y DÓNDE

### Git
- **`main`** en `6733b15` (`chore: sistema de handoff de sesión`).
- 🔴 **`main` está 11 commits ADELANTE de `origin/main` — sin pushear.** Nada de F0..F5 ni el
  handoff está en el remoto todavía → **Vercel no lo desplegó**.
- **Worktree de la sesión:** `.claude/worktrees/xenodochial-cannon-fca96b/` en `979c359`
  (rama `claude/xenodochial-cannon-fca96b`). Ya mergeado a `main`; **se puede limpiar**
  (`git worktree remove .claude/worktrees/xenodochial-cannon-fca96b`).
- Working tree limpio (sin cambios sin commitear).

### Deploy (Vercel)
- Framework Next.js (`vercel.json`). Deploy automático en cada push de la rama conectada.
- Portal de cliente en **`jobs.loyola.com.ar`**.
- ⚠️ Para llevar F0..F5 a producción web: **`git push origin main`** y esperar el deploy.
  **El deploy NO aplica las migraciones SQL** (ver abajo) — hay que hacerlas a mano antes/después.

### Base de datos (Supabase) — ✅ MIGRACIONES APLICADAS (2026-06-26)
Las 5 migraciones de la sesión ya están aplicadas en producción (todas dieron "Success"):
- ✅ `2026-05-11_add_performance_indexes.sql` (F1.7).
- ✅ `2026-05-11_team_members.sql` (F2: tabla + enum `team_role` + RLS).
- ✅ `2026-05-11_team_members_rls_extension.sql` (F2: RLS extendida para team_members).
- ✅ `2026-05-11_project_access.sql` (F4: `project_access` + `client_users.sees_all_projects` +
  `hour_packages.reserved_for_client_user_id` + policies del portal).
- ✅ `2026-05-11_milestones.sql` (F5: `milestones` + enum `milestone_status` + `time_entries.milestone_id`).

La DB ya soporta F2/F4/F5. Cada `.sql` es idempotente (re-correr no rompe). Verificación rápida:
`SELECT to_regclass('public.team_members'), to_regclass('public.project_access'), to_regclass('public.milestones');`

### RLS — auditada (F0 §3.4)
11 tablas críticas con RLS activa y policies por `auth.uid()`. **Recordá:** Prisma usa `DATABASE_URL`
(rol con privilegios) y **BYPASEA la RLS** → el filtrado por `ownerId` / scope de portal en las Server
Actions es la **primera** línea de defensa; la RLS es defensa en profundidad.

### Credenciales (UBICACIÓN — nunca el valor)
- **`.env.local`** (raíz, no versionado): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (usada por `lib/supabase/admin.ts`), `DATABASE_URL` (Prisma), `AFIP_*`
  (certificados en base64). Plantilla: `.env.example`.
- **Vercel:** las mismas variables en el dashboard del proyecto.

---

## 2. Logros de esta sesión

> Detalle por fase en `IMPROVEMENT_PLAN.md` (cada sección tiene su estado 🟡/✅).

- **F0 — Hotfixes producción** (`2260cb3`, `83745f1`): `getDashboardStats` filtra por user + separa
  ingresos por moneda; enums PascalCase duplicados borrados; idempotencia AFIP (advisory lock +
  `updateMany WHERE cae IS NULL`); **RLS auditada** (§3.4).
- **F1 — Cleanup** (`a23bcb5`, `6401a59`, `747174d`): `lib/utils/duration.ts` (minutos), índices de
  performance (aplicados), validación zod (`lib/validations/*`), limpieza de artifacts + `.gitignore`.
- **F2 — Multi-user provider** (`d9b59dd`): `team_members` + `lib/auth/owner-context.ts`
  (`getOwnerContext`, `canManageWorkspace`, `canSeeFinancials`). Refactor de clients/projects/tasks/
  time-entries/invoices/payments/reports/stats por `ownerId`. Collaborator no ve invoices; admin sí.
- **F3 — Onboarding UI** (`343b765`): `/dashboard/settings/team` (`lib/actions/team-members.ts`,
  crea usuario en Supabase Auth si no existe).
- **F4 — Multi-stakeholder cliente** (`857f9d2`): `project_access` + `sees_all_projects`,
  `lib/auth/portal-context.ts` (`getPortalProjectFilter`), refactor de queries del portal, validación
  anti-invoice-mixta, UI `/dashboard/projects/[id]/stakeholders`.
- **F5 — Hitos/milestones** (`979c359`): `milestones` + `time_entries.milestone_id`,
  `lib/actions/milestones.ts`, UI admin `/dashboard/projects/[id]/milestones` + panel en portal cliente.
- **Merge a `main`** (fast-forward) de los 8 commits F0..F5.
- **Sistema de handoff** (`6733b15`): comando `/handoff` (`.claude/commands/handoff.md`), `CLAUDE.md`
  (contexto durable), `handoff.md` (esta foto) y `.gitignore` (versiona `.claude/commands/`, ignora
  worktrees/settings locales). Replica el patrón de HermesAgent.

---

## 3. Pendientes y bloqueantes (por prioridad)

1. **🔴 `git push origin main`** (11 commits adelante) y verificar el deploy en Vercel. La DB ya está
   migrada, así que el push no rompe runtime.
2. **Onboarding real:** invitar a **Lucio** y **Antonela** como team_members desde
   `/dashboard/settings/team`. Configurar stakeholders de **Illinois** (Jeremías → Odoo, Agustín →
   robots) en `/dashboard/projects/[id]/stakeholders` (con `sees_all_projects = false`).
3. **Limpiar el worktree** `.claude/worktrees/xenodochial-cannon-fca96b/` (ya mergeado).
4. **Fases siguientes (no empezadas):** F6 currency en payments/invoices, F7 soft-delete, F8 tests
   críticos, F9 hour_packages atómicos, F10 UI/UX + email de facturas. Ver `IMPROVEMENT_PLAN.md` §8/§9.
5. **✅ Hecho esta sesión:** 4 migraciones SQL aplicadas en Supabase.

---

## 4. Runbook — cómo hacer las cosas

### Desarrollo
```bash
npm run dev            # localhost:3000
npm run build          # build de producción
npx tsc --noEmit       # typecheck (EXIT 0 antes de commitear)
npx prisma generate    # regenerar cliente Prisma tras tocar schema.prisma
```

### Aplicar una migración SQL (manual, Supabase)
1. Supabase dashboard → proyecto MyKimai → **SQL Editor → New query**.
2. Pegar el contenido completo del `.sql` (`supabase/migrations/`) y Run. Orden en §1 (#2 depende de #1).
3. ⚠️ El SQL Editor corre en transacción → **nada de `CREATE INDEX CONCURRENTLY`** (error 25001); usar
   `CREATE INDEX` normal.
4. Verificar con el bloque comentado al final de cada `.sql`.

### Publicar a producción
```bash
git push origin main          # dispara el deploy de Vercel
# y aplicar las migraciones SQL pendientes en Supabase (no las hace el deploy)
```

### Auditar RLS (read-only, en Supabase)
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd;
```

### Git con worktrees
```bash
git worktree list
git merge --ff-only claude/<rama>      # mergear rama del worktree a main
git worktree remove .claude/worktrees/<nombre>   # limpiar worktree ya mergeado
```

### Cerrar una sesión
Correr **`/handoff`** → revisar `handoff.md` → `/clear`. En la sesión nueva: *"leé el handoff"*.

---

## 5. Decisiones clave

- **Prisma (`DATABASE_URL`) bypasea la RLS** → filtrado por `ownerId`/portal en el código = primera
  defensa; RLS = defensa en profundidad. (`IMPROVEMENT_PLAN.md` §3.4, F4.)
- **Multi-user = "Owner + Team Members" (Opción B)**, no workspaces. Lucas único owner; Lucio/Antonela
  cargan horas bajo su workspace. (§5.)
- **Visibilidad de cliente granular por proyecto** vía `project_access` + `sees_all_projects` (default
  `true` para legacy). Invoice multi-proyecto con stakeholders distintos **prohibida** al crear. (§6.)
- **Migraciones manuales** en el SQL Editor (no `prisma migrate`); `CREATE INDEX` sin `CONCURRENTLY`.
- **Duración en minutos** (SSOT en triggers de la DB); `lib/utils/duration.ts` para formateo.

## Mapa de documentación / código
- **Roadmap/diseño:** `IMPROVEMENT_PLAN.md` (F0..F10, schema diffs, RLS, tests). **Historial:**
  `CHANGELOG.md`. **Marca:** `BRANDING.md`. **Contexto durable:** `CLAUDE.md`.
- **Auth/contexto:** `lib/auth/owner-context.ts` (provider) · `lib/auth/portal-context.ts` (cliente)
  · `lib/auth/server.ts`.
- **Server Actions:** `lib/actions/` · **Validaciones:** `lib/validations/` · **Migraciones:**
  `supabase/migrations/`.

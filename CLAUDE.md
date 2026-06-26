# MyKimai — Contexto del proyecto

> Este archivo se carga automáticamente al iniciar una sesión de Claude Code en este directorio.

## ⏱️ Estado al día — leer primero

**Antes de trabajar, leé [`handoff.md`](handoff.md).** Es la foto de la **última sesión**: estado de
git/deploy, **migraciones SQL pendientes de aplicar en Supabase**, pendientes, roadmap y el
**runbook** (cómo hacer cada cosa). `CLAUDE.md` = contexto durable; `handoff.md` = la diaria.
Se regenera con el comando **`/handoff`**.

- **Roadmap y diseño:** [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md) (fases F0..F10, schema diffs,
  guidelines de RLS, tests críticos).
- **Historial:** [`CHANGELOG.md`](CHANGELOG.md). **Identidad visual:** [`BRANDING.md`](BRANDING.md).

## Qué es

Sistema de gestión de tiempos y facturación (estilo Kimai) para Lucas Loyola, ingeniero freelancer
(electrónica / robótica / automatización). Está en **producción real** — se usa para facturarle a
clientes como **Juntas Illinois SA**. Evolucionando a **MyKimai 2.0**: multi-usuario del lado del
proveedor (equipo) y multi-stakeholder del lado del cliente.

**Módulos:** clientes, proyectos, tareas, time tracker, "Mis Horas", paquetes de horas, facturación
(interna + legal AFIP), reportes, portal de cliente, equipo (team members), hitos.

## Stack

- **Next.js 14+ (App Router) + TypeScript** · Server Actions (`"use server"`) + Prisma para datos.
- **Prisma 7 + `@prisma/adapter-pg`** sobre **PostgreSQL de Supabase**.
- **Supabase Auth** (login admin + portal cliente) + **Supabase Storage** (logos).
- **shadcn/ui + Tailwind** · **@react-pdf/renderer** (facturas) · **recharts** · **zod** + react-hook-form.
- **AFIP/ARCA** vía `@afipsdk/afip.js` (comprobantes electrónicos, CAE, QR).
- **Deploy en Vercel**; portal cliente en **`jobs.loyola.com.ar`**.

## Reglas de oro (no negociables)

1. **Prisma (`DATABASE_URL`) BYPASEA la RLS.** Toda Server Action debe filtrar explícitamente por el
   workspace: usar `getOwnerContext()` (`ownerId`) para datos del proveedor y `getPortalProjectFilter()`
   para el portal cliente. La RLS de Supabase es defensa en profundidad, **no** la primera línea.
2. **El monto (`amount`) y la duración neta se calculan en la DB** (triggers). El código consume lo
   persistido; no recalcular montos en el cliente. Unidad de duración = **minutos** (`lib/utils/duration.ts`).
3. **Tarifa en cascada con SSOT** en `resolveRate` (`lib/utils/rates.ts`): Tarea > Proyecto > Cliente >
   general. La tarifa se persiste por evento (`rate_applied`) para inmutabilidad histórica.
4. **Roles del workspace:** `owner` (Lucas, único; muta todo), `admin` (team member que ve invoices),
   `collaborator` (team member que solo carga horas, NO ve invoices/payments). Gates en
   `lib/auth/owner-context.ts` (`canManageWorkspace`, `canSeeFinancials`).
5. **Migraciones manuales.** Este proyecto NO usa `prisma migrate`. Tras tocar `prisma/schema.prisma`:
   `npx prisma generate` + crear el `.sql` en `supabase/migrations/` (idempotente) para aplicar a mano
   en el SQL Editor. **El SQL Editor corre en transacción → nada de `CREATE INDEX CONCURRENTLY`.**
6. **Nunca subir secretos.** `.env.local` no se versiona. En docs/handoff, solo la **ubicación** del
   secreto, jamás el valor.

## Convenciones

- **Validación zod** en Server Actions de mutación (`lib/validations/`).
- **Dual auth:** `getAuthUser()` (usuario interno) vs `getClientContext()` (cliente del portal).
  El dashboard redirige a un cliente del portal fuera de `/dashboard`.
- **Formato de hora 24h** en todo el sistema (`lib/date-format.ts`: `formatTime24`, etc.).
- **Antes de commitear:** `npx tsc --noEmit` en EXIT 0.
- **Workflow git:** ramas de trabajo en worktrees bajo `.claude/worktrees/`; merge a `main` por
  fast-forward; el push a `main` dispara el deploy de Vercel.

## Cierre de sesión

Al terminar, correr **`/handoff`** para regenerar `handoff.md`, revisarlo, y recién ahí `/clear`.
En la sesión nueva: *"leé el handoff"*.

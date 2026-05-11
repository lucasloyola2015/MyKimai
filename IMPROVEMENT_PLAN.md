# MyKimai 2.0 — Plan unificado de evolución

**Fecha:** 2026-05-11 (consolidación)
**Plan base:** revisión técnica integral del repositorio + schema + lógica core (2026-05-10).
**Estado:** activo, en ejecución.
**Repositorio:** [`MyKimai`](https://github.com/lucasloyola2015/MyKimai)

Este documento unifica:

1. El análisis técnico **MyKimai 2.0** (2026-05-10).
2. La sección **"Próximas Mejoras"** del [`README.md`](README.md).
3. Los **"Pendientes"** registrados en el [`CHANGELOG.md`](CHANGELOG.md) (sesión 2026-01-30).

Y refleja el estado real verificado del código al 2026-05-11.

---

## Índice

1. [Contexto y objetivo](#1-contexto-y-objetivo)
2. [Estado actual — lo que está sólido](#2-estado-actual--lo-que-está-sólido)
3. [Bugs de producción (P0)](#3-bugs-de-producción-p0)
4. [Inconsistencias técnicas (P1)](#4-inconsistencias-técnicas-p1)
5. [Gap arquitectónico A: multi-user del lado del proveedor](#5-gap-arquitectónico-a-multi-user-del-lado-del-proveedor)
6. [Gap arquitectónico B: multi-stakeholder del lado del cliente](#6-gap-arquitectónico-b-multi-stakeholder-del-lado-del-cliente)
7. [Hitos / Milestones](#7-hitos--milestones)
8. [Backlog menor — features pendientes (README + CHANGELOG)](#8-backlog-menor--features-pendientes-readme--changelog)
9. [Roadmap por fases](#9-roadmap-por-fases)
10. [Apéndice A — Schema diff propuesto](#apéndice-a--schema-diff-propuesto)
11. [Apéndice B — RLS policies (guidelines)](#apéndice-b--rls-policies-guidelines)
12. [Apéndice C — Tests críticos a escribir](#apéndice-c--tests-críticos-a-escribir)
13. [Apéndice D — Decisiones abiertas para Lucas](#apéndice-d--decisiones-abiertas-para-lucas)

---

## Leyenda de estado

- ✅ **Done** — implementado y verificado.
- 🟡 **Partial** — parcialmente hecho; falta refuerzo.
- ⏳ **Pending** — todavía no se tocó.
- 🔒 **Blocked** — requiere decisión externa o trabajo manual fuera del repo.

---

## 1. Contexto y objetivo

### Qué es MyKimai hoy

Sistema de tracking de tiempo y facturación construido para el uso personal de Lucas como ingeniero freelancer. Diseñado **single-user** (un dueño, sus clientes, sus proyectos, sus invoices). Hoy está en **producción real** — se utiliza para cobrarle, entre otros, al cliente **Juntas Illinois SA**, donde Lucas tiene varios proyectos activos en paralelo (migración a Odoo, automatización de robots, desarrollo de máquinas).

Stack:

- Next.js 14+ (App Router) con TypeScript
- Prisma 7 + PostgreSQL (Supabase)
- Supabase Auth + RLS
- shadcn/ui + Tailwind CSS
- AFIP integrado (`@afipsdk/afip.js`)
- Deploy en Vercel

### Objetivo de la evolución

Transformar MyKimai en un sistema sobre el cual Lucas pueda **apoyar la gestión de proyectos compartidos con terceros**:

1. **Equipo del lado del proveedor**: que Lucio (desarrollador Odoo) y Antonela (consultora funcional) puedan cargar horas en proyectos del cliente Illinois bajo el ownership comercial de Lucas. Trazabilidad de quién hizo qué, sin compartir credenciales.

2. **Stakeholders del lado del cliente**: que el portal cliente permita que **distintas personas dentro del mismo cliente** vean **distintos proyectos**. En el caso concreto de Illinois: Jeremías (gerente de sistemas, responsable del proyecto Odoo) NO debe ver lo que hace Agustín (responsable de robots), y viceversa. El cliente legal es uno solo (Juntas Illinois SA), pero la visibilidad operativa debe estar segmentada por proyecto.

3. **Transparencia mediante hitos**: que cada stakeholder del cliente pueda ver el progreso de los proyectos que le corresponden contra hitos definidos, con horas trabajadas, importes facturados y estado de cumplimiento.

4. **Calidad de producción**: cerrar los bugs detectados que hoy ponen en riesgo la confiabilidad del dato que se le muestra al cliente.

### Roles previstos en MyKimai 2.0

| Rol | Lado | Acceso |
|---|---|---|
| Owner | Proveedor | Acceso total. Único dueño comercial. Es Lucas. |
| Team Member (collaborator) | Proveedor | Carga time entries en proyectos del owner. No ve invoices ni payments. |
| Team Member (admin) | Proveedor | Como collaborator + lee invoices/payments. No los emite. |
| Client User (manager) | Cliente | Ve proyectos asignados + sus invoices + sus hitos. Puede comentar. |
| Client User (viewer) | Cliente | Solo lee proyectos asignados. |

---

## 2. Estado actual — lo que está sólido

Antes de proponer cambios, lo que **no hay que tocar** porque está bien resuelto:

- **Stack convencional y consistente** con prácticas modernas del ecosistema Next.js.
- **`.cursorrules` con roles definidos** (`@architect`, `@designer`, `@devops`) y workflow profesional. Mantener.
- **Schema rico desde el inicio**:
  - Multi-currency (`currency` en `clients`, `projects`, `invoices`, `hour_packages`).
  - Cascada de tarifas con SSOT explícito en `lib/utils/rates.ts` y `RateSource` para mostrar al usuario por qué se aplicó tal tarifa.
  - **Dual billing** `LEGAL` / `INTERNAL` desde día 1 — refleja la realidad fiscal argentina (parte legal con CAE + parte por canal informal).
  - AFIP completo: `cae`, `cae_due_date`, `afip_error`, `cbte_tipo`, `punto_venta`, `cbte_nro`, `issuer_tax_id`.
  - `time_entry_breaks` como subtabla con `duration_neto` separado de `duration_total`.
  - `hour_packages.expires_at`, granularidad `is_billable` a 3 niveles (cliente, proyecto, tarea).
  - Soporte AFIP QR (`lib/afip-qr.ts`).
- **Patrón Server Actions correctamente etiquetado** con `"use server"`.
- **Dual auth resuelta**: `getAuthUser()` para usuario regular, `getClientContext()` para cliente del portal, con redirect en `app/dashboard/layout.tsx` si entra un usuario portal por la ruta dashboard. Esa separación es valiosa.
- **Resilient layout**: `Suspense` + `PageErrorBoundary` + fallback skeleton. Pensado para producción.
- **`decimalToNumber` helper** para el dolor crónico del `Decimal` de Prisma. Trampa pisada y resuelta.
- **`getNavStats`** ya migrado a Server Action + Prisma en `lib/actions/stats.ts` (filtra por `user.id`).

Todo lo siguiente del documento parte de la premisa de **no romper** estas decisiones.

---

## 3. Bugs de producción (P0)

Estos están en código que ya está sirviendo datos a clientes reales. **Cerrarlos antes que cualquier feature nueva**.

### 3.1. ⏳ `totalRevenue` lee facturas de TODOS los users

**Estado:** Pendiente (verificado 2026-05-11).
**Ubicación:** [`app/dashboard/page.tsx:98-101`](app/dashboard/page.tsx)

```ts
const { data: paidInvoices } = await supabase
    .from("invoices")
    .select("total_amount, currency")
    .eq("status", "paid");
```

**Problema:** la query no filtra por `user_id` (ni directo ni vía join a `clients.user_id`). Si la RLS de Supabase no está activa o tiene un hueco para esta tabla, **la tarjeta de "Ingresos Totales" del dashboard suma facturas pagas de todos los usuarios del sistema**. Privacy bug serio + dato incorrecto al usuario.

**Fix:**

1. Migrar a Server Action que use Prisma + `getAuthUser`:
   ```ts
   // lib/actions/stats.ts
   export async function getDashboardStats() {
     const user = await getAuthUser();
     const paidInvoices = await prisma.invoices.findMany({
       where: { status: 'paid', clients: { user_id: user.id } },
       select: { total_amount: true, currency: true }
     });
     // ... agregar por currency, ver §3.2
   }
   ```
2. Llamar desde el componente como server action (ver §4.1).

**Severidad:** crítica.

### 3.2. ⏳ `totalRevenue` suma USD y ARS sin distinguir

**Estado:** Pendiente.
**Ubicación:** misma que 3.1.

```ts
const totalRevenue = paidInvoices?.reduce((sum, inv) => sum + inv.total_amount, 0) || 0;
```

**Problema:** suma `total_amount` independientemente de `currency`. Una factura USD 1.000 y una ARS 1.000 se suman como 2.000. Dato incorrecto.

**Fix (opciones):**

1. **Mostrar tarjetas separadas por moneda** (más simple, más correcto): 1 tarjeta por currency con total propio.
2. **Convertir a moneda canónica** (ARS o USD) usando tipo de cambio del día. Ya existe `getUsdExchangeRate()` en `lib/actions/exchange.ts`. Pero esto solo sirve si las invoices tienen guardado el `usd_exchange_rate` al momento de emisión (hoy NO está en la tabla `invoices` aunque sí en `time_entries`). Ver §4.2.

**Recomendación:** opción 1 ahora, opción 2 cuando se cierre §4.2.

**Severidad:** crítica.

### 3.3. ⏳ Enums duplicados en el schema Prisma

**Estado:** Pendiente. Verificado 2026-05-11.
**Ubicación:** [`prisma/schema.prisma`](prisma/schema.prisma) — líneas 762-848.

Duplicación detectada:

| PascalCase (huérfano) | snake_case (en uso por columnas) |
|---|---|
| `AccessLevel` (762) | `access_level` (802) |
| `BillingType` (769) | `billing_type` (809) |
| `InvoiceItemType` (776) | `invoice_item_type` (823) |
| `InvoiceStatus` (783) | `invoice_status` (830) |
| `ProjectStatus` (793) | `project_status` (841) |

(Y `billing_type_invoice` existe sola — sin duplicado — para el enum `LEGAL`/`INTERNAL`.)

**Problema:** las PascalCase generan tipos en TypeScript pero **NO están enlazadas a ninguna columna real** (verificado: el grep en relations no las encuentra). Sin embargo, código TypeScript las importa como type:

- `lib/actions/invoices.ts:7` → `InvoiceStatus`
- `lib/actions/projects.ts:6` → `BillingType`, `ProjectStatus`
- `lib/types/database.ts:9-13` → re-exporta los 5

Esto crea ambigüedad perpetua y diff ruidoso en migraciones.

**Fix:**

1. Borrar los 5 enums PascalCase del schema.
2. Ejecutar `npx prisma generate`.
3. Migrar imports en `lib/actions/invoices.ts` y `lib/actions/projects.ts` a las versiones snake_case (o a `Prisma.$Enums.invoice_status`, etc.).
4. `lib/types/database.ts` ya define los string literal types — esos pueden quedarse (son tipos puros TS, no de Prisma).

**Severidad:** media (no rompe pero genera confusión perpetua y diff ruidoso).

### 3.4. ✅ RLS auditada en producción

**Estado:** Cerrado (auditoría 2026-05-11).
**Ubicación:** Supabase dashboard.

**Resultado de la auditoría:**

- Las 11 tablas críticas tienen `rowsecurity = true`: `clients`, `projects`, `tasks`, `time_entries`, `time_entry_breaks`, `invoices`, `invoice_items`, `payments`, `hour_packages`, `client_users`, `user_fiscal_settings`.
- Cada tabla tiene policies separadas para `SELECT`, `INSERT`, `UPDATE`, `DELETE` (o una policy `ALL` equivalente en el caso de `time_entry_breaks`).
- Los `SELECT/UPDATE/DELETE` filtran por `auth.uid()` directo o vía join a `clients.user_id` (o función `is_client_owner`).
- Los `INSERT` tienen `WITH CHECK` que previene insertar a nombre de otro user (`auth.uid() = user_id` o vía join a `clients.user_id`).
- Tablas que también soportan acceso desde portal cliente tienen policies adicionales filtradas por `clients.portal_user_id = auth.uid()` o `client_users.user_id = auth.uid()`.

**Implicancia para el bug §3.1:** la RLS de `invoices` SÍ filtra por `clients.user_id = auth.uid()`. La query bugueada del dashboard, en producción, hubiera retornado **0 filas** en lugar de leak — pero igualmente reemplazarla por la Server Action filtrada es la defensa en profundidad correcta.

**Detalle histórico (versión original del bug, antes de la auditoría):**

**Problema:** el `schema.prisma` tiene comentarios de Prisma del estilo:
```
/// This model contains row level security and requires additional setup for migrations.
```
Estos comentarios son **advertencias** de Prisma diciendo "esta tabla declara RLS pero la migración tiene que hacerse aparte" — no son confirmación de que la RLS efectivamente esté activa con políticas correctas.

**Riesgo concreto:** si para `invoices` la RLS no está activada o las policies tienen un hueco, los bugs 3.1 y 3.2 se vuelven explotables.

**Fix (checklist para correr en Supabase SQL Editor):**

1. Listar para cada tabla del schema `public` si tiene RLS habilitada:
   ```sql
   SELECT schemaname, tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY tablename;
   ```
2. Para cada tabla con `rowsecurity = false` que contenga datos de usuario, habilitarla y crear policies.
3. **Test funcional**: crear un usuario de prueba, crear data con ese user, hacer query desde un JWT distinto. Si ve la data del primero → RLS rota.

El checklist completo queda registrado en este documento como parte del audit gate.

**Severidad:** crítica (es un audit gate antes de invitar a Lucio/Antonela/Jeremías/Agustín).

### 3.5. 🟡 Idempotencia AFIP — chequeo presente, falta transaccionalidad

**Estado:** Parcial. Verificado 2026-05-11.
**Ubicación:** [`lib/actions/afip-actions.ts`](lib/actions/afip-actions.ts).

**Lo que ya está:**

```ts
const invoice = await prisma.invoices.findUnique({ where: { id: invoiceId }, ... });
if (!invoice) throw new Error("Factura no encontrada");
if (invoice.cae) throw new Error("La factura ya tiene un CAE asignado");
```

El chequeo `invoice.cae` ya bloquea re-emisión. Pero **no es transaccional** (no usa `FOR UPDATE`), así que dos requests concurrentes (doble click, retry de timeout) pueden pasar ambos el chequeo antes de que el primero persista el CAE.

**Fix:**

1. Wrap la operación crítica en `prisma.$transaction` con re-lectura `FOR UPDATE`:
   ```ts
   await prisma.$transaction(async (tx) => {
     const fresh = await tx.$queryRaw<{ cae: string | null }[]>`
       SELECT cae FROM invoices WHERE id = ${invoiceId}::uuid FOR UPDATE
     `;
     if (fresh[0]?.cae) throw new Error("CAE ya asignado");
     // ... llamada a AFIP + tx.invoices.update
   });
   ```
2. Considerar guardar un `afip_request_id` (UUID que mandás a AFIP como cliente) para poder reconciliar si la respuesta se pierde a mitad.

**Severidad:** crítica (problema fiscal real).

---

## 4. Inconsistencias técnicas (P1)

Mejorar antes de Fase 1 (multi-user) para que el código no se complejice con bugs latentes.

### 4.1. ⏳ `app/dashboard/page.tsx` mezcla Supabase client con el patrón del resto

**Problema:** el resto del código usa Server Actions + Prisma. Este componente es `"use client"` y usa `createClientComponentClient()` con queries directos a `supabase-js`. Inconsistente con el workflow definido en `.cursorrules`.

**Fix:** migrar a Server Component que llame a `getDashboardStats()` (nueva Server Action). Esto resuelve simultáneamente bugs 3.1 y 3.2. **Se hace en el mismo PR de F0.**

### 4.2. ⏳ `payments` y `invoices` sin `exchange_rate` ni `currency` consistente

**Problema:** las invoices son multi-currency. Si una factura USD se paga en ARS al tipo de cambio del día, esa info se pierde. Tampoco hay manera de convertir invoices históricas a moneda canónica para reportes.

**Fix (en `payments`):**
```prisma
model payments {
  ...
  currency      String   @default("USD") @db.VarChar(3)
  exchange_rate Decimal? @db.Decimal(10, 4)  // moneda del pago a moneda de la invoice
}
```

**Fix (en `invoices`):**
```prisma
model invoices {
  ...
  exchange_rate_to_ars Decimal? @db.Decimal(10, 4)  // tipo de cambio a ARS al momento de emisión
}
```

Eso permite reportes en cualquier moneda y trazabilidad de pago.

### 4.3. ⏳ `hour_packages.hours_used` sin link autoritativo a `time_entries`

**Problema:** `hour_packages` tiene `hours` (compradas) y `hours_used` (consumidas). Pero NO hay forma autoritativa de saber **qué time entries consumieron qué paquete**. Hoy se calcula por convención (filtro client+project+período). Si un cliente discute un cargo, no hay traza.

**Fix:**

```prisma
model time_entries {
  ...
  consumed_from_package_id String? @db.Uuid
  hour_packages            hour_packages? @relation(fields: [consumed_from_package_id], references: [id])
}
```

Lógica de aplicación:

- Al cerrar un time entry billable, decidir qué paquete consume (FIFO de paquetes activos no expirados con horas disponibles).
- Descontar `hour_packages.hours_used` atómicamente en transacción.
- Si no hay paquete con horas → entry queda como "facturable directamente".

### 4.4. ✅ Unidad de `duration_total` y `duration_neto` documentada

**Problema:** el schema declara `duration_total Int?` y `duration_neto Int?`. En `app/dashboard/page.tsx` se formatean como minutos. En otros archivos puede asumirse segundos. Riesgo silencioso de bug por inconsistencia.

**Fix:**

1. Comentar el schema:
   ```prisma
   /// Duración total en minutos, incluyendo pausas
   duration_total Int?
   /// Duración neta en minutos, restando pausas
   duration_neto  Int?
   ```
2. Crear helper único `lib/utils/duration.ts`:
   ```ts
   export function formatDurationMinutes(minutes: number): string { ... }
   export function calculateDurationMinutes(start: Date, end: Date, breaks: TimeEntryBreak[]): { total: number; net: number } { ... }
   ```
3. Reemplazar todos los formateos inline por el helper.

### 4.5. 🟡 Validación zod en Server Actions críticas (parcial)

**Problema:** `zod` está en dependencies, pero no veo schemas de validación de entrada en las Server Actions. Cualquier cliente malicioso o componente con bug puede mandar payloads raros (cantidades negativas, fechas en el futuro lejano, IDs random).

**Fix:** cada Server Action de mutación debería tener:

```ts
const startTimeEntrySchema = z.object({
  task_id: z.string().uuid(),
  description: z.string().max(500).optional(),
  start_time: z.coerce.date().optional(),
});

export async function startTimeEntry(input: z.input<typeof startTimeEntrySchema>) {
  const data = startTimeEntrySchema.parse(input);
  // ... resto
}
```

### 4.6. ⏳ Soft-delete vs hard-delete

**Problema:** `clients`, `projects`, `tasks` con `onDelete: Cascade`. Si un usuario borra un proyecto sin querer, se borran todos los `time_entries`, `hour_packages`, `invoice_items` relacionados. **Para datos de facturación, hard-delete es peligroso** (auditoría AFIP requiere trazabilidad por años).

**Fix:**

1. Agregar `deleted_at TIMESTAMPTZ NULL` en `clients`, `projects`, `tasks`, `invoices`.
2. Migrar todos los `onDelete: Cascade` a `onDelete: Restrict` salvo donde el cascade es legítimo (subtablas de detalle como `invoice_items`, `time_entry_breaks`).
3. UI de "borrar" pasa a setear `deleted_at = now()`.
4. Queries por defecto agregan `WHERE deleted_at IS NULL`.

### 4.7. ✅ Índices de performance agregados

```prisma
// time_entry_breaks
@@index([time_entry_id, start_time])

// invoices
@@index([created_at(sort: Desc)])

// time_entries
@@index([is_billed, billable])  // para queries de "horas no facturadas"
```

### 4.8. ⏳ N+1 potencial en `getRecentTimeEntries`

**Problema:** en `lib/actions/time-entries.ts` se hace `findMany` con `include: { tasks: { include: { projects: { include: { clients: true }}}}}`. Para 10 entradas son 4 niveles de joins. Si la lista se hace de 100+, pesa.

**Fix:** `select` específico con solo las columnas necesarias para la UI (probablemente: `tasks.name`, `projects.name`, `clients.name`).

### 4.9. ✅ Logs/artifacts del root limpiados

`output.log`, `output.txt`, `test-output.txt`, `triggers-detail.txt`, `billing-check.txt`, `temp_check.sql`, `fix_database.sql`, `fix_database_utf8.sql`, `reproduction.txt`, `columns.txt`, `billing-check-v2.txt`.

**Fix:**

- Mover a carpeta `_scratch/` o similar.
- Agregarlos al `.gitignore`.
- Si `fix_database.sql` tiene cambios reales necesarios, formalizarlos como migraciones Supabase y borrar.

### 4.10. ⏳ PWA — service worker no verificado

**Problema:** existe `app/manifest.ts` y carpeta `components/pwa/` pero el CHANGELOG indica `public/sw.js` registrado. Validar que efectivamente funcione en producción con Lighthouse PWA audit.

**Fix:** correr Lighthouse PWA audit en `https://jobs.loyola.com.ar`. Si falla, decidir si se mantiene PWA (con `next-pwa` o `serwist`) o se elimina.

### 4.11. ⏳ Sin tests automatizados

**Problema:** no hay carpeta `__tests__/` ni `vitest.config.ts`. Para un sistema de facturación esto es deuda.

**Fix:** ver §[Apéndice C](#apéndice-c--tests-críticos-a-escribir) con la lista priorizada.

---

## 5. Gap arquitectónico A: multi-user del lado del proveedor

### El problema

MyKimai está diseñado **single-user**. El README lo dice explícito: *"El sistema está diseñado para un solo usuario por cuenta"*.

El schema lo confirma:

- `clients.user_id` → ÚNICO dueño del cliente.
- `projects` cuelga de `clients` (sin `user_id` propio, hereda).
- `time_entries.user_id` → quien tracketea es UN user específico.
- `client_users` existe pero solo para el portal del cliente (no para multi-user del lado del proveedor).

Cuando Lucio y Antonela empiecen a colaborar:

- **Compartir login con Lucas** → mala práctica, sin trazabilidad de quién cargó cada hora.
- **Cuentas separadas con duplicación** → cada uno tiene que crear el cliente Illinois en su cuenta, y consolidar reportes a mano. Lío operativo crónico.
- **Refactor a multi-user** → la solución correcta.

### Las 2 opciones

| Modelo | Cómo funciona | Esfuerzo | Cuándo elegirlo |
|---|---|---|---|
| **A. Workspaces (orgs)** | Crear `workspaces` + `workspace_members(role)`. Todo (clients/projects/time_entries) referencia `workspace_id` en lugar de `user_id`. Modelo SaaS típico. | **3-5 días**. Migración de datos existentes obligatoria. RLS y queries reescritas. | Si MyKimai se vende a otros freelancers como SaaS multi-tenant. |
| **B. Owner + Team Members** | Mantener `clients.user_id` como "owner" (siempre Lucas). Crear `team_members(user_id, owner_id, role, default_rate)`. `time_entries.user_id` sigue siendo quien hizo la entrada. Queries de "mis clientes" miran `clients.user_id = me OR me in team_members where owner=clients.user_id`. | **1-2 días**. RLS adaptada. Migración trivial. | **El caso de Lucas**: él es el único dueño comercial, Lucio y Antonela son colaboradores que cargan horas. |

### Recomendación: Opción B

Razones:

- Mantiene la simplicidad del modelo conceptual (un dueño comercial por proyecto).
- Refactor liviano comparado con A.
- Es exactamente el modelo del acuerdo comercial real (Lucas factura a Illinois, Lucio y Antonela facturan directo a Illinois cuando aplique).
- Si en el futuro MyKimai escala a SaaS, se migra a A. Por ahora over-engineering.

### Cambios concretos al schema

Ver §[Apéndice A](#apéndice-a--schema-diff-propuesto), sección "Multi-user provider side".

### Cambios concretos en código

#### Helper de contexto

Agregar `lib/auth/owner-context.ts`:

```ts
import { getAuthUser } from "./server";
import { prisma } from "@/lib/prisma/client";

/**
 * Devuelve el ownerId del workspace al que pertenece el user logueado.
 * - Si el user es owner: devuelve su propio user_id.
 * - Si es team_member activo: devuelve el owner_id de su membership.
 * - Si no es ninguno: throw.
 */
export async function getOwnerContext(): Promise<{ ownerId: string; isOwner: boolean; role: 'owner' | 'admin' | 'collaborator' }> {
  const user = await getAuthUser();

  // ¿Es owner de algún cliente?
  const ownsAnyClient = await prisma.clients.findFirst({
    where: { user_id: user.id, deleted_at: null },
    select: { id: true }
  });
  if (ownsAnyClient) {
    return { ownerId: user.id, isOwner: true, role: 'owner' };
  }

  // ¿Es team member activo?
  const membership = await prisma.team_members.findFirst({
    where: { user_id: user.id, removed_at: null },
    select: { owner_id: true, role: true }
  });
  if (membership) {
    return { ownerId: membership.owner_id, isOwner: false, role: membership.role };
  }

  throw new Error('Usuario sin contexto de owner');
}
```

#### Adaptar queries

Patrón viejo:
```ts
const clients = await prisma.clients.findMany({ where: { user_id: user.id } });
```

Patrón nuevo:
```ts
const { ownerId } = await getOwnerContext();
const clients = await prisma.clients.findMany({ where: { user_id: ownerId, deleted_at: null } });
```

#### Permisos por rol en team

Reglas mínimas a aplicar en cada Server Action:

| Acción | Owner | Admin | Collaborator |
|---|:-:|:-:|:-:|
| Crear/editar clients, projects, tasks | ✓ | ✗ | ✗ |
| Cargar time entries en proyectos del owner | ✓ | ✓ | ✓ |
| Editar/borrar time entries propios | ✓ | ✓ | ✓ |
| Editar/borrar time entries de otros | ✓ | ✗ | ✗ |
| Crear/emitir invoices | ✓ | ✗ | ✗ |
| Ver invoices/payments | ✓ | ✓ | ✗ |
| Invitar nuevos team members | ✓ | ✗ | ✗ |

---

## 6. Gap arquitectónico B: multi-stakeholder del lado del cliente

### 6.1. El problema (caso Illinois)

Hoy `client_users` permite que varios mails accedan al portal de un mismo `client`. Pero el acceso es **all-or-nothing**: ven TODO lo del cliente.

El requisito real:

> *"Illinois lo tengo a Jeremías que me contrata para lo de Odoo, pero está Agustín para lo relacionado a los robots. No quiero que Agustín vea lo de Jeremías ni viceversa mediante mi software... el cliente es el mismo pero los responsables de proyecto no."*

Es un patrón típico en clientes empresariales medianos/grandes:

- Un único cliente legal (Juntas Illinois SA) con un solo CUIT.
- Varios proyectos en paralelo (Odoo, Robótica, Visión Artificial, etc.).
- Cada proyecto tiene su sponsor / responsable interno distinto.
- Los responsables NO deben verse entre sí: política comercial razonable (un gerente no quiere que sus pares vean su backlog ni sus costos).

### 6.2. Diseño propuesto

Granularidad de acceso a nivel **proyecto**, no a nivel cliente.

**Modelo nuevo:** `project_access(project_id, client_user_id, role)`.

Cada `client_user` recibe acceso explícito a uno o más proyectos del cliente al que pertenece. Las queries del portal cliente filtran a partir de esta tabla.

**Diagrama conceptual:**

```
clients (Juntas Illinois SA)
   ├── client_users (Jeremías) → project_access(Odoo)
   ├── client_users (Agustín) → project_access(Robots planta)
   │                          → project_access(Visión maquina X)
   └── client_users (Norberto, contable) → project_access(Odoo, viewer)
                                        → project_access(Robots, viewer)

projects
   ├── Odoo (visible a: Jeremías + Norberto)
   ├── Robots planta (visible a: Agustín + Norberto)
   └── Visión maquina X (visible a: Agustín)
```

Cada usuario del portal solo ve los proyectos que tiene en `project_access`.

### 6.3. Cambios al schema

Ver §[Apéndice A — Schema diff](#apéndice-a--schema-diff-propuesto), sección "Multi-stakeholder client side".

Resumen:

```prisma
model project_access {
  id              String                @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  project_id      String                @db.Uuid
  client_user_id  String                @db.Uuid
  role            project_access_role   @default(viewer)
  granted_at      DateTime              @default(now()) @db.Timestamptz(6)
  granted_by      String?               @db.Uuid             // user_id del owner que otorgó (Lucas)
  revoked_at      DateTime?             @db.Timestamptz(6)
  projects        projects              @relation(fields: [project_id], references: [id], onDelete: Cascade)
  client_users    client_users          @relation(fields: [client_user_id], references: [id], onDelete: Cascade)

  @@unique([project_id, client_user_id])
  @@index([project_id])
  @@index([client_user_id])
  @@schema("public")
}

enum project_access_role {
  viewer    // ve progreso + invoices del proyecto + comentarios
  manager   // viewer + puede aprobar hitos + comentar formalmente
  @@schema("public")
}
```

### 6.4. Reglas de visibilidad

#### Para `projects`

Un `client_user` puede leer el proyecto si:

```
EXISTS project_access WHERE project_access.project_id = project.id
                       AND project_access.client_user_id = current_client_user.id
                       AND project_access.revoked_at IS NULL
```

#### Para `time_entries`

Solo si tiene acceso al proyecto del task del entry:

```
client_user puede ver time_entry si:
  EXISTS project_access WHERE project_access.project_id = time_entry.tasks.project_id
                         AND project_access.client_user_id = current_client_user.id
                         AND project_access.revoked_at IS NULL
```

Los time entries muestran al cliente: descripción, duración, fecha, hito asociado, importe (si billable). **NO** muestran quién (interno) los hizo, salvo decisión de compartirlo.

#### Para `invoices`

Caso especial. Una invoice agrupa items que pueden ser de **varios proyectos**. Reglas:

- **Caso simple — invoice de un solo proyecto**: visible para client_users que tengan acceso a ese proyecto.
- **Caso compuesto — invoice multi-proyecto**: dos opciones de diseño:
  - **Opción 1 (estricta, recomendada)**: una invoice solo es visible a un client_user si tiene acceso a **TODOS** los proyectos referenciados por sus items. En la práctica, esto fuerza a Lucas a no mezclar items de proyectos con responsables distintos en una sola factura. Más limpio.
  - **Opción 2 (laxa)**: la invoice es visible si tiene acceso a **AL MENOS** uno de los proyectos. Riesgo: Agustín ve un total que incluye horas de Odoo de Jeremías. Mal.

**Decisión técnica:** ir con **Opción 1**. Bonus: el sistema puede prevenir activamente que se cree una invoice mezclada (validación al guardar).

#### Para `hour_packages`

- Si `hour_packages.project_id` está seteado: visible a quien tenga acceso al proyecto.
- Si `hour_packages.project_id` es NULL (paquete del cliente, no del proyecto): solo visible para client_users con flag `sees_all_projects = true`. Por defecto false. Útil para roles tipo "contable del cliente" que ve totalidad. Ver §6.5.

#### Para `milestones` (ver §7)

Igual que `time_entries`: visible si tiene acceso al proyecto.

### 6.5. Edge cases y consideraciones

#### Rol "ve todo el cliente" para roles transversales

Algunos clientes tienen un rol contable o de pagaduría que necesita ver TODO. Sugerencia:

```prisma
model client_users {
  ...
  sees_all_projects Boolean @default(false)
}
```

Si está en true, las queries no filtran por `project_access` para ese user — ve todo. Útil para Norberto (contable) en el caso Illinois.

#### Cómo se asigna `project_access`

UI: en la página de un proyecto, una sección "Stakeholders" donde Lucas puede:

- Ver lista de `client_users` del cliente.
- Asignar / revocar acceso al proyecto, eligiendo rol (viewer/manager).
- Invitar un nuevo `client_user` (envía email de invitación) y pre-asignarle acceso.

#### Migración de datos actuales

Hoy los `client_users` existentes tienen acceso a TODO el cliente. Migración propuesta:

- Agregar `sees_all_projects = true` por default a todos los `client_users` existentes (= comportamiento actual).
- Cuando Lucas explícitamente quiere granular para un cliente, setea `sees_all_projects = false` y agrega `project_access` específicos.
- Eso garantiza que la migración no rompe accesos existentes hasta que se decide segmentar.

#### Paquetes de horas multi-stakeholder

Caso real: Illinois compra 200 hs como paquete general, pero dentro hay 80 hs para Jeremías (Odoo) y 120 hs para Agustín (robots). Hoy el modelo no lo soporta.

Fix:

```prisma
model hour_packages {
  ...
  reserved_for_user_id String? @db.Uuid    // FK a client_users.id; si está, solo ese stakeholder ve el paquete
}
```

Eso permite "este paquete es de Jeremías".

#### Comentarios y conversaciones

Cuando un client_user comenta sobre un proyecto/hito (feature futura), el comentario debe ser visible solo para users con acceso a ese proyecto. No es complejo: misma regla.

---

## 7. Hitos / Milestones

### 7.1. Por qué

Para que el cliente vea **progreso** y no solo "horas trabajadas y total facturable". Permite:

- Comprometer entregables ante el cliente con fecha objetivo.
- Reportar avance % contra el plan.
- Justificar hitos de pago en proyectos largos.
- Para Lucas: mostrar a Jeremías que el proyecto Odoo va por F1 (relevamiento) cerrado, F2 (setup) en 30%, etc.

### 7.2. Modelo

```prisma
model milestones {
  id                String              @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  project_id        String              @db.Uuid
  name              String              @db.VarChar(255)
  description       String?
  target_date       DateTime?           @db.Date
  status            milestone_status    @default(planned)
  completed_at      DateTime?           @db.Timestamptz(6)
  completion_notes  String?
  budget_hours      Decimal?            @db.Decimal(10, 2)        // horas presupuestadas
  budget_amount     Decimal?            @db.Decimal(10, 2)        // monto presupuestado
  budget_currency   String?             @db.VarChar(3)
  display_order     Int                 @default(0)
  visible_to_client Boolean             @default(true)
  created_at        DateTime            @default(now()) @db.Timestamptz(6)
  updated_at        DateTime            @default(now()) @db.Timestamptz(6)
  projects          projects            @relation(fields: [project_id], references: [id], onDelete: Cascade)
  time_entries      time_entries[]

  @@index([project_id, display_order])
  @@index([status])
  @@schema("public")
}

enum milestone_status {
  planned
  in_progress
  completed
  blocked
  cancelled
  @@schema("public")
}
```

Y en `time_entries`:
```prisma
model time_entries {
  ...
  milestone_id String?    @db.Uuid
  milestones   milestones? @relation(fields: [milestone_id], references: [id])
  @@index([milestone_id])
}
```

### 7.3. UI cliente — vista de progreso

En `app/client-portal/projects/[id]/page.tsx`, agregar tab "Hitos":

```
Proyecto: Migración Odoo Juntas Illinois
─────────────────────────────────────────────────
Avance global: [████████░░░░░░] 65%   (130 / 200 hs)

Hitos
─────────────────────────────────────────────────
[✓] F1 Relevamiento profundo
    Completado el 2026-05-15 (180/200 hs estimadas)
    Notas: Documentación cerrada en repo.

[◐] F2 Setup Odoo + ETL              [En progreso]
    Target: 2026-07-30
    Avance: 45 / 300 hs (15%)
    [▓▓░░░░░░░░░░░░░░]

[○] F3 Configuración funcional       [Planificado]
    Target: 2026-09-30

[○] F4 Capacitación + go-live        [Planificado]
    Target: 2026-11-15
```

Al expandir un hito: lista de time entries asociados, importe acumulado, comentarios.

### 7.4. Validación al cerrar un hito

Cuando se marca `status = completed`:

- Bloquear edición de los time_entries vinculados (para que no se puedan cambiar retroactivamente).
- Calcular `actual_hours = sum(duration_neto / 60)` y guardar como atributo.
- Calcular `actual_amount = sum(amount)` y guardar como atributo.
- Notificar a los `client_users` con acceso al proyecto (email del portal).

---

## 8. Backlog menor — features pendientes (README + CHANGELOG)

Items registrados en otros documentos del repo. Se mantienen en backlog pero NO bloquean el camino crítico hacia el onboarding del equipo Illinois.

### Desde `README.md` § "Próximas Mejoras"

| Item | Prioridad | Fase sugerida |
|---|:-:|:-:|
| ⏳ Envío de facturas por email | Media | F10 |
| ⏳ Notificaciones de paquetes de horas (vencimiento + saldo bajo) | Media | F9 |
| ⏳ Gráficos y visualizaciones avanzadas | Baja | F10 |
| ⏳ Exportación de reportes en múltiples formatos (PDF está, falta XLSX) | Baja | F10 |
| ⏳ Integración con herramientas externas (Slack, calendario, etc.) | Baja | post-F10 |

### Desde `CHANGELOG.md` (sesión 2026-01-30, "Pendientes")

| Item | Estado | Notas |
|---|---|---|
| ⏳ Facturación parcial (selector de horas específicas para items individuales) | Pendiente | Validar si los recientes `c52e8d3` / `4e092e7` ya lo cubren parcial. |
| 🟡 Sistema de facturación dual `LEGAL` / `INTERNAL` con numeración independiente | Parcial | Schema y enum `billing_type_invoice` listos; falta verificar numeración independiente por canal. |
| ⏳ Finalizar UI del selector en `app/dashboard/billing/select/[clientId]/page.tsx` | Pendiente | Ver §3 backlog si ya está superado por commits recientes. |

---

## 9. Roadmap por fases

| Fase | Contenido | Esfuerzo (días-persona) | Riesgo | Dependencias |
|---|---|:-:|:-:|---|
| **F0. Hotfixes producción** | §3.1, §3.2, §3.3, §3.4, §3.5 | 1-1.5 | Bajo | Backup Supabase previo |
| **F1. Cleanup y validaciones** | §4.1 (cerrado junto a F0), §4.4, §4.5, §4.7, §4.9 | 1-1.5 | Bajo | F0 |
| **F2. Multi-user provider side** | §5 — modelo Owner + Team Members | 1.5-2 | Medio | F0, F1 + RLS rewrite |
| **F3. Onboarding Lucio + Antonela** | Crear cuentas, agregarlos como team_members, primeros time entries en sandbox | 0.5 | Bajo | F2 |
| **F4. Multi-stakeholder client side** | §6 — `project_access` + `sees_all_projects` + adaptación portal | 2-3 | Medio | F2 |
| **F5. Hitos / milestones** | §7 — schema + UI dashboard + UI portal | 2-3 | Bajo | F4 |
| **F6. Currency + payments correctos** | §3.2 (versión 2) + §4.2 | 1 | Bajo | F0 |
| **F7. Soft-delete** | §4.6 — migración + UI | 1 | Medio | F1 |
| **F8. Tests críticos** | §Apéndice C — al menos resolveRate, duración, AFIP mock | 2 | Bajo | Cualquier fase |
| **F9. Hour packages atómicos** | §4.3 — relación time_entries + descuento transaccional + notificaciones (README) | 1.5 | Bajo | F1 |
| **F10. UI/UX y comunicación** | Comentarios, email de invoices, gráficos avanzados, exportes adicionales | 2-3 | Bajo | F5 |

**Total estimado:** 16-23 días-persona distribuidos.

**Camino recomendado para llegar al "ready para arrancar Odoo Illinois con equipo":**

1. F0 + F1 (esta semana — 2-3 días)
2. F2 + F3 (semana 2 — 2-3 días)
3. F4 + F5 (semana 3 — 4-6 días)
4. F8 en paralelo (cuando haya bandwidth)
5. F6, F7, F9, F10 en sprints posteriores, mientras ya está en uso real

Antes de la primera review formal con Jeremías sobre el progreso de Odoo, debe estar como mínimo F0..F5. Eso es ~10-15 días de trabajo.

---

## Apéndice A — Schema diff propuesto

### A.1. Multi-user provider side (§5)

```prisma
// === NUEVO ===
model team_members {
  id            String      @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  owner_id      String      @db.Uuid
  user_id       String      @db.Uuid
  role          team_role   @default(collaborator)
  default_rate  Decimal?    @db.Decimal(10, 2)
  default_currency String?  @db.VarChar(3)
  invited_at    DateTime    @default(now()) @db.Timestamptz(6)
  accepted_at   DateTime?   @db.Timestamptz(6)
  removed_at    DateTime?   @db.Timestamptz(6)
  created_at    DateTime    @default(now()) @db.Timestamptz(6)
  owner         users       @relation("team_owner", fields: [owner_id], references: [id], onDelete: Cascade)
  member        users       @relation("team_member", fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([owner_id, user_id])
  @@index([owner_id])
  @@index([user_id])
  @@schema("public")
}

enum team_role {
  collaborator   // carga horas en proyectos del owner
  admin          // collaborator + lee invoices/payments
  @@schema("public")
}

// === MODIFICACIÓN del modelo users (Supabase auth) ===
// Agregar relaciones bidireccionales:
//   team_members_as_owner  team_members[] @relation("team_owner")
//   team_members_as_member team_members[] @relation("team_member")
```

### A.2. Multi-stakeholder client side (§6)

```prisma
// === NUEVO ===
model project_access {
  id              String                @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  project_id      String                @db.Uuid
  client_user_id  String                @db.Uuid
  role            project_access_role   @default(viewer)
  granted_at      DateTime              @default(now()) @db.Timestamptz(6)
  granted_by      String?               @db.Uuid
  revoked_at      DateTime?             @db.Timestamptz(6)
  projects        projects              @relation(fields: [project_id], references: [id], onDelete: Cascade)
  client_user     client_users          @relation(fields: [client_user_id], references: [id], onDelete: Cascade)

  @@unique([project_id, client_user_id])
  @@index([project_id])
  @@index([client_user_id])
  @@schema("public")
}

enum project_access_role {
  viewer
  manager
  @@schema("public")
}

// === MODIFICACIÓN client_users ===
model client_users {
  ...
  sees_all_projects Boolean @default(false)
  project_access    project_access[]
}

// === MODIFICACIÓN projects ===
model projects {
  ...
  project_access project_access[]
}

// === MODIFICACIÓN hour_packages ===
model hour_packages {
  ...
  reserved_for_client_user_id String? @db.Uuid
  reserved_for                client_users? @relation(fields: [reserved_for_client_user_id], references: [id])
}
```

### A.3. Hitos (§7)

```prisma
model milestones {
  id                String              @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  project_id        String              @db.Uuid
  name              String              @db.VarChar(255)
  description       String?
  target_date       DateTime?           @db.Date
  status            milestone_status    @default(planned)
  completed_at      DateTime?           @db.Timestamptz(6)
  completion_notes  String?
  budget_hours      Decimal?            @db.Decimal(10, 2)
  budget_amount     Decimal?            @db.Decimal(10, 2)
  budget_currency   String?             @db.VarChar(3)
  actual_hours      Decimal?            @db.Decimal(10, 2)
  actual_amount     Decimal?            @db.Decimal(10, 2)
  display_order     Int                 @default(0)
  visible_to_client Boolean             @default(true)
  created_at        DateTime            @default(now()) @db.Timestamptz(6)
  updated_at        DateTime            @default(now()) @db.Timestamptz(6)
  projects          projects            @relation(fields: [project_id], references: [id], onDelete: Cascade)
  time_entries      time_entries[]

  @@index([project_id, display_order])
  @@index([status])
  @@schema("public")
}

enum milestone_status {
  planned
  in_progress
  completed
  blocked
  cancelled
  @@schema("public")
}

model time_entries {
  ...
  milestone_id String?    @db.Uuid
  milestones   milestones? @relation(fields: [milestone_id], references: [id])
  @@index([milestone_id])
}

model projects {
  ...
  milestones milestones[]
}
```

### A.4. Soft-delete (§4.6)

Agregar a `clients`, `projects`, `tasks`, `invoices`, `hour_packages`:

```prisma
deleted_at DateTime? @db.Timestamptz(6)
@@index([deleted_at])
```

Cambiar relations existentes con `onDelete: Cascade` por `onDelete: Restrict` salvo en subtablas de detalle.

### A.5. Currency en payments e invoices (§4.2)

```prisma
model payments {
  ...
  currency      String   @default("USD") @db.VarChar(3)
  exchange_rate Decimal? @db.Decimal(10, 4)
}

model invoices {
  ...
  exchange_rate_to_ars Decimal? @db.Decimal(10, 4)
}
```

### A.6. hour_packages atómicos (§4.3)

```prisma
model time_entries {
  ...
  consumed_from_package_id String? @db.Uuid
  hour_packages            hour_packages? @relation(fields: [consumed_from_package_id], references: [id])
  @@index([consumed_from_package_id])
}

model hour_packages {
  ...
  consumed_by_entries time_entries[]
}
```

---

## Apéndice B — RLS policies (guidelines)

### B.1. Principios

- Toda tabla `public.*` debe tener `ROW LEVEL SECURITY ENABLED`.
- Las policies deben funcionar con `auth.uid()` (JWT del user de Supabase).
- Distinguir 3 contextos:
  - **Owner**: usuario dueño del workspace.
  - **Team Member**: usuario que figura en `team_members(user_id = auth.uid(), removed_at IS NULL)`.
  - **Client User**: usuario que figura en `client_users(user_id = auth.uid())`.
- Las RLS deben prohibir acceso por defecto y permitir solo casos explícitos.

### B.2. Policies para `clients`

```sql
-- SELECT
CREATE POLICY clients_select ON clients FOR SELECT USING (
  -- owner directo
  user_id = auth.uid()
  OR
  -- team member del owner
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.owner_id = clients.user_id
      AND tm.user_id = auth.uid()
      AND tm.removed_at IS NULL
  )
  OR
  -- client_user del cliente con sees_all_projects
  EXISTS (
    SELECT 1 FROM client_users cu
    WHERE cu.client_id = clients.id
      AND cu.user_id = auth.uid()
      AND cu.sees_all_projects = true
  )
  OR
  -- client_user con acceso a al menos un proyecto del cliente
  EXISTS (
    SELECT 1 FROM client_users cu
    JOIN project_access pa ON pa.client_user_id = cu.id
    JOIN projects p ON p.id = pa.project_id
    WHERE cu.client_id = clients.id
      AND cu.user_id = auth.uid()
      AND p.client_id = clients.id
      AND pa.revoked_at IS NULL
  )
);

-- INSERT/UPDATE/DELETE: solo owner
CREATE POLICY clients_modify ON clients FOR ALL USING (user_id = auth.uid());
```

### B.3. Policies para `projects`

```sql
CREATE POLICY projects_select ON projects FOR SELECT USING (
  -- owner directo
  EXISTS (SELECT 1 FROM clients c WHERE c.id = projects.client_id AND c.user_id = auth.uid())
  OR
  -- team member del owner
  EXISTS (
    SELECT 1 FROM clients c
    JOIN team_members tm ON tm.owner_id = c.user_id
    WHERE c.id = projects.client_id
      AND tm.user_id = auth.uid()
      AND tm.removed_at IS NULL
  )
  OR
  -- client_user con sees_all_projects
  EXISTS (
    SELECT 1 FROM client_users cu
    WHERE cu.client_id = projects.client_id
      AND cu.user_id = auth.uid()
      AND cu.sees_all_projects = true
  )
  OR
  -- client_user con acceso explícito al proyecto
  EXISTS (
    SELECT 1 FROM project_access pa
    JOIN client_users cu ON cu.id = pa.client_user_id
    WHERE pa.project_id = projects.id
      AND cu.user_id = auth.uid()
      AND pa.revoked_at IS NULL
  )
);
```

### B.4. Policies para `time_entries`

Heredar permiso del proyecto (vía `tasks.project_id`):

```sql
CREATE POLICY time_entries_select ON time_entries FOR SELECT USING (
  -- el user que la creó
  user_id = auth.uid()
  OR
  -- owner del proyecto
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN clients c ON c.id = p.client_id
    WHERE t.id = time_entries.task_id
      AND c.user_id = auth.uid()
  )
  OR
  -- team member del owner del proyecto
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN clients c ON c.id = p.client_id
    JOIN team_members tm ON tm.owner_id = c.user_id
    WHERE t.id = time_entries.task_id
      AND tm.user_id = auth.uid()
      AND tm.removed_at IS NULL
  )
  OR
  -- client_user con acceso al proyecto
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN project_access pa ON pa.project_id = t.project_id
    JOIN client_users cu ON cu.id = pa.client_user_id
    WHERE t.id = time_entries.task_id
      AND cu.user_id = auth.uid()
      AND pa.revoked_at IS NULL
  )
);

-- INSERT: el user que crea debe ser owner o team_member
CREATE POLICY time_entries_insert ON time_entries FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      JOIN clients c ON c.id = p.client_id
      WHERE t.id = time_entries.task_id
        AND c.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      JOIN clients c ON c.id = p.client_id
      JOIN team_members tm ON tm.owner_id = c.user_id
      WHERE t.id = time_entries.task_id
        AND tm.user_id = auth.uid()
        AND tm.removed_at IS NULL
    )
  )
);

-- UPDATE/DELETE: solo el dueño de la entrada o el owner del proyecto
CREATE POLICY time_entries_modify ON time_entries FOR UPDATE USING (
  user_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN clients c ON c.id = p.client_id
    WHERE t.id = time_entries.task_id
      AND c.user_id = auth.uid()
  )
);
```

### B.5. Policies para `invoices`

```sql
-- SELECT
CREATE POLICY invoices_select ON invoices FOR SELECT USING (
  -- owner del cliente
  EXISTS (SELECT 1 FROM clients c WHERE c.id = invoices.client_id AND c.user_id = auth.uid())
  OR
  -- team member admin (collaborator NO ve invoices)
  EXISTS (
    SELECT 1 FROM clients c
    JOIN team_members tm ON tm.owner_id = c.user_id
    WHERE c.id = invoices.client_id
      AND tm.user_id = auth.uid()
      AND tm.removed_at IS NULL
      AND tm.role = 'admin'
  )
  OR
  -- client_user con sees_all_projects
  EXISTS (
    SELECT 1 FROM client_users cu
    WHERE cu.client_id = invoices.client_id
      AND cu.user_id = auth.uid()
      AND cu.sees_all_projects = true
  )
  OR
  -- client_user con acceso a TODOS los proyectos referenciados por items de la invoice
  -- (regla estricta — ver §6.4)
  NOT EXISTS (
    SELECT 1 FROM invoice_items ii
    JOIN time_entries te ON te.id = ii.time_entry_id
    JOIN tasks t ON t.id = te.task_id
    LEFT JOIN project_access pa
      ON pa.project_id = t.project_id
      AND pa.client_user_id IN (
        SELECT id FROM client_users WHERE user_id = auth.uid() AND client_id = invoices.client_id
      )
      AND pa.revoked_at IS NULL
    WHERE ii.invoice_id = invoices.id
      AND pa.id IS NULL
  )
);
```

(La regla estricta de invoices se puede simplificar usando una vista o función PL/pgSQL — el SQL anterior es ilustrativo.)

### B.6. Checklist de auditoría manual (para §3.4)

Correr en SQL Editor de Supabase:

```sql
-- 1. ¿Qué tablas tienen RLS activa?
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. ¿Qué policies existen por tabla?
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Tablas críticas que DEBEN tener RLS:
-- clients, projects, tasks, time_entries, time_entry_breaks,
-- invoices, invoice_items, payments, hour_packages,
-- client_users, user_settings.
```

Test funcional:

1. Crear `user_A` y `user_B` en Supabase Auth.
2. Loguear como `user_A`, crear un client.
3. Loguear como `user_B`, intentar `SELECT * FROM clients`.
4. Resultado esperado: 0 filas.
5. Si `user_B` ve el client de `user_A` → RLS rota, bloquear deploy de F2.

### B.7. Validación al crear invoice

Idealmente, una **función trigger** que prevenga crear invoices "mezcladas":

```sql
CREATE OR REPLACE FUNCTION validate_invoice_consistency()
RETURNS trigger AS $$
DECLARE
  num_projects integer;
BEGIN
  SELECT COUNT(DISTINCT t.project_id) INTO num_projects
  FROM invoice_items ii
  JOIN time_entries te ON te.id = ii.time_entry_id
  JOIN tasks t ON t.id = te.task_id
  WHERE ii.invoice_id = NEW.id;

  -- Si hay items de proyectos cuyos client_users tienen acceso no superpuesto, rechazar
  -- (lógica adicional para evitar invoice "mixta" indeseada)

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Apéndice C — Tests críticos a escribir

### Prioridad 1 (lógica de dinero — debe estar antes que cualquier otra cosa)

| Test | Función | Casos |
|---|---|---|
| `resolveRate` cascada completa | `lib/utils/rates.ts` | task con rate / sin rate; project con rate / sin rate; client con default; ninguno |
| `resolveRate` con flags `is_billable` | idem | client.is_billable=false → rate 0; project.is_billable=false → idem; task.is_billable=false → idem |
| `calculateNetDurationMinutes` | `lib/utils.ts` | sin pausas; pausa cerrada; pausa abierta (sin end); múltiples pausas; pausas solapadas (¿error?) |
| `computeEntryTotals` | idem | rate + duration → amount correcto; null rate → null amount |

### Prioridad 2 (AFIP — fiscal)

| Test | Función | Casos |
|---|---|---|
| Idempotencia: re-emitir CAE | `lib/actions/afip-actions.ts` | invoice ya con CAE → no llamar a AFIP |
| Mock AFIP error → no persiste cae | idem | response error → invoice queda sin cae, error guardado en `afip_error` |
| QR contenido | `lib/afip-qr.ts` | datos del CAE generan QR con payload AFIP correcto |

### Prioridad 3 (multi-stakeholder)

| Test | Función | Casos |
|---|---|---|
| `getProjectsForClientUser` ve solo asignados | nuevo | Jeremías ve solo Odoo, no Robots |
| `getInvoicesForClientUser` regla estricta | nuevo | invoice mixta → no visible |
| `sees_all_projects = true` ve todo | nuevo | Norberto ve Odoo y Robots |

### Prioridad 4 (multi-user provider)

| Test | Función | Casos |
|---|---|---|
| `getOwnerContext` para owner | `lib/auth/owner-context.ts` | devuelve su propio user_id |
| `getOwnerContext` para team_member | idem | devuelve owner_id de membership |
| RLS team_member: puede crear time_entry | integration | sí en owner.client; no en otro client |
| RLS team_member collaborator: NO ve invoices | integration | invoices select retorna 0 filas |

### Prioridad 5 (hour_packages)

| Test | Casos |
|---|---|
| Consumo FIFO de paquetes | dos paquetes activos, FIFO por purchased_at |
| No consume de paquete expirado | expires_at < now → skip |
| Consumo atómico (no race) | dos entries simultáneos no pueden sobre-consumir |

### Stack sugerido

- `vitest` + `@vitest/ui` para unit tests.
- Tests de integración con `prisma` apuntando a una DB de test (Supabase local con docker, o postgres local).
- Mock de AFIP con `msw` o stub directo de `@afipsdk/afip.js`.

---

## Apéndice D — Decisiones abiertas para Lucas

Antes de implementar fases avanzadas, algunas decisiones requieren input específico:

### D.1. Sobre multi-user provider

- ¿Lucio y Antonela necesitan acceso a invoices de proyectos donde colaboraron? Recomendación: **collaborator NO ve invoices**, **admin SÍ**. Pero confirmar.
- ¿Tarifa horaria de cada team_member es interna (cómo se reparte la torta entre Lucas y ellos) o se factura al cliente con esa tarifa? Si es interna, sumar `default_rate` al modelo `team_members` con clarificación de propósito.

### D.2. Sobre multi-stakeholder client

- ¿Caso default cuando se crea un nuevo `client_user`: tiene `sees_all_projects = true` o `false`? Recomendación: **false** (deny by default), Lucas asigna proyectos explícitamente.
- ¿Permitir invoice multi-proyecto y aplicar filtro de visibilidad estricto, o **prohibir** invoice multi-proyecto cuando los proyectos tienen distintos responsables? Recomendación: **prohibir** con validación al guardar (más limpio operativamente).
- ¿Los hitos son siempre visibles al cliente (`visible_to_client = true` por default) o por defecto privados? Recomendación: **true** por default, Lucas puede ocultar hitos internos puntualmente.

### D.3. Sobre AFIP

- ¿La emisión actual está cubierta por test manual o tenés alguna factura con CAE para usar como golden snapshot? Útil para tests de regresión.

### D.4. Sobre soft-delete

- ¿Hay clientes/proyectos viejos en la DB de prod que deberían ser ya marcados `deleted_at`? Si la migración los pisa con `null`, todos quedan visibles y ensucian el dashboard.

### D.5. Sobre hour packages

- ¿Hoy tenés algún paquete de horas activo con Illinois o solo factura por hora? Define si el desarrollo de §4.3 es prioridad o puede esperar.

### D.6. Sobre el cliente Illinois en particular

Si la respuesta a alguna de estas es relevante para arrancar la planificación con el equipo, vale documentarla acá:

- Lista actual de proyectos Lucas-Illinois en MyKimai.
- Quién es client_user hoy en Illinois (¿Jeremías ya está, Agustín, ambos, ninguno?).
- Tarifa horaria actual y si va a cambiar para el proyecto Odoo.
- ¿Hay paquete de horas comprado por Illinois?

---

## Cierre

Este documento es la línea base del trabajo de evolución de MyKimai. Su propósito:

- Que Lucas tenga una vista consolidada de todo lo que hay que mejorar y por qué.
- Que Lucio y Antonela puedan opinar y sumarse al trabajo desde la misma página.
- Que sirva de tracking en sucesivos PRs (cada commit que cierre una sección actualiza el ✅).

**Próximos pasos en curso:**

1. ✅ Plan unificado (este documento).
2. 🟢 **En ejecución:** F0 hotfixes (§3) — branch actual.
3. F1 cleanup (§4) — siguiente PR.
4. F2 multi-user provider (§5) — semana 2.
5. F4 + F5 (multi-stakeholder + hitos) antes de la primera review formal con Jeremías.

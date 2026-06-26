# Análisis de diseño — MyKimai (2026-06-26)

> Revisión profunda multi-agente del diseño del sistema: fallas, riesgos y mejoras.
> Cada hallazgo fue **verificado adversarialmente leyendo el código real** (severidad =
> la ajustada por el verificador, no la del primer revisor). Foco fuerte en **facturación
> informal (INTERNAL)** y **generación de PDFs**; AFIP/conexiones tratado solo donde impacta.
> Cubre: seguridad/multi-tenancy, facturación, PDF, modelo de datos, time-tracking,
> performance, reportes/portal, calidad de código y coherencia de arquitectura.

---

## 0. Veredicto general

**El sistema está sorprendentemente bien diseñado para un proyecto de un solo autor en
producción.** El schema es rico desde el día 1 (multi-currency, dual billing, breaks con neto
separado), la cascada de tarifas tiene SSOT explícito (`resolveRate`), la doble auth
(interno vs portal) está limpiamente separada, el patrón `ownerId` es consistente en **casi**
todas las Server Actions, y el nivel de autodocumentación (`IMPROVEMENT_PLAN.md`, roadmap
F0–F10) es mejor que el de la mayoría de los productos comerciales.

**Pero casi todas las fallas serias aparecen en la misma costura: el pasaje de _un_ usuario a
_varios_.** El modelo de seguridad ("Prisma bypasea RLS → filtramos a mano por `ownerId`") es
correcto como principio pero frágil como mecanismo: depende de que un humano no se olvide en
ninguna de ~50 funciones. **Ya hay olvidos, y dos son críticos.** La numeración fiscal es
global, la identidad del actor se infiere en vez de declararse, y la lógica de dinero está
duplicada (TS + trigger). Nada de esto rompe hoy con un solo usuario; todo se activa cuando
entren Lucio/Antonela y más stakeholders.

La conclusión práctica: **antes de seguir agregando features del roadmap, hay que endurecer
esas costuras.** El orden correcto es por *irreversibilidad del daño*, no por comodidad.

---

## 1. Plan de acción priorizado

Ordenado por riesgo real (irreversibilidad + probabilidad de activarse):

| # | Acción | Por qué primero | Esfuerzo |
|---|--------|-----------------|----------|
| 1 | **Tapar los 2 IDOR cross-tenant críticos** (`getTimeEntries` clientId-override, AFIP sin ownership) | Fuga/acción cross-tenant explotable hoy por cualquier usuario interno autenticado | S |
| 2 | **`onDelete: Cascade` → `RESTRICT` en FKs fiscales** + guard en `deleteClient` | Borrar un cliente destruye físicamente facturas con CAE (pérdida irreversible, obligación legal AFIP) | M |
| 3 | **Resto de IDOR/fugas de portal** (`calculateEntryAmount`, `getPortalUnbilledSummary`, lecturas portal sin `project_access`) | Manipulación de montos y fuga multi-stakeholder (lo que F4 buscaba evitar) | S–M |
| 4 | **Validación zod en `payments`/`clients`/`projects`/`tasks`** + CHECK constraints de dinero | `recordPayment` acepta montos negativos/NaN/sobre-pago sin red | S–M |
| 5 | **Versionar los triggers** de `amount`/`duration` en `supabase/migrations/` | Hoy viven en scripts `.ts` sueltos → un re-deploy desde cero pierde la lógica financiera | M |
| 6 | **Numeración de factura por-owner y atómica** (secuencia Postgres) | Bomba latente: colisiona y filtra conteo entre workspaces apenas haya 2 emisores | M |
| 7 | **Tests de la lógica de dinero y de tenant-scoping** (vitest) | Red de seguridad antes de seguir sumando superficie multi-user | M |
| 8 | **Unificar PDF**: borrar las 2 plantillas react-pdf muertas, arreglar tablas DUPLICADO/TRIPLICADO | Riesgo de "arreglar el archivo equivocado" + copias que el cliente ve desalineadas | S |
| 9 | **Implementar consumo de `hour_packages.hours_used`** o documentarlo como no-funcional | El saldo de prepagos (caso Illinois) es ficticio hoy | M–L |
| 10 | Paginación, timezone Argentina, refactor de archivos gigantes, capa de dominio | Escala y mantenibilidad | M–L |

---

## 2. Seguridad & Multi-tenancy

> Inventario función-por-función de las 16 Server Actions. La gran mayoría está **bien
> scopeada**; lo que sigue son los huecos. Regla de oro: Prisma bypasea RLS, así que el
> filtro en código es la **primera** (y a veces única) línea de defensa.

### 🔴 CRÍTICO

**SEC-1 · `getTimeEntries`: el filtro `clientId` sobrescribe el scope del portal**
`lib/actions/time-entries.ts:513-572`
La rama portal fija `where.tasks.projects.client_id = clientContext.clientId` (524-529), pero
más abajo `if (filters?.clientId)` **reemplaza** `where.tasks.projects` por
`{ client_id: filters.clientId }` (564-572), pisando el scope de sesión.
**Explotación:** un cliente del portal llama `getTimeEntries({ clientId: "<id-ajeno>" })` y
recibe **todos los time entries de otro cliente** (descripciones, tareas, proyectos). El id es
enumerable.
**Fix:** en portal, nunca aceptar `filters.clientId`/`projectId` que sobrescriban el scope;
componer con AND sobre el scope de sesión y aplicar `taskProjectIdFilter(portalFilter)`.

**SEC-2 · AFIP: emisión/anulación fiscal sin ownership ni rol**
`lib/actions/afip-actions.ts:39, 225`
`generateFiscalInvoice(invoiceId)` y `generateCreditNote(originalInvoiceId)` hacen
`findUnique({where:{id}})` (61-62, 227-228) **sin** filtrar por `clients.user_id=ownerId` y
**sin** `canManageWorkspace`/`canSeeFinancials`.
**Explotación:** cualquier usuario interno autenticado — incluido un `collaborator`, que ni
debería ver facturas — invoca la action con el id de una factura **de otro tenant** y solicita
un CAE real contra el CUIT ajeno, o emite una Nota de Crédito que **anula** una factura ajena
ya autorizada. La ruta `/dashboard/invoices/[id]` no bloquea a `collaborator`.
**Por qué importa aunque "no uses AFIP":** es un **IDOR de seguridad**, no funcionalidad AFIP.
Hoy solo lo ataja la RLS de Supabase — exactamente lo que la regla #1 dice que **no** debe
pasar (RLS terminó siendo la primera línea).
**Fix:** `const ctx = await getOwnerContext(); if (!canManageWorkspace(ctx)) return error;` +
`findFirst({where:{id, clients:{user_id: ctx.ownerId}}})`.

### 🟠 ALTO

**SEC-3 · `calculateEntryAmount`: mutación de monto sin ownership**
`lib/actions/time-entries.ts:1137-1186` (alias `recalculateTimeEntryRate`)
Usa `getAuthUser()` + `findUnique({where:{id:entryId}})` sin verificar autor ni workspace, y
luego `update` recalculando `rate_applied`/`amount`/`billable`. **Cualquier usuario interno
muta el monto facturable de un time entry de otro tenant.**
**Fix:** reusar `ensureCanOperateEntry(entryId)` (ya existe en el mismo archivo, 45-81).

**SEC-4 · `getPortalUnbilledSummary`: calcula `restrictedProjectIds` pero nunca lo aplica**
`lib/actions/portal.ts:143-202` (el `restrictedProjectIds` queda como dead code en 150)
Un stakeholder restringido (`sees_all_projects=false`) ve **montos y horas no facturadas de
TODOS los proyectos del cliente**, no solo los suyos — y es la única zona del portal que
expone valores monetarios. Es exactamente la fuga que F4 quería evitar (caso Illinois:
Agustín no debería ver lo de Jeremías).
**Fix:** agregar `...(restrictedProjectIds && { id: { in: restrictedProjectIds } })` en
`tasks.projects`, idéntico a sus funciones hermanas.

**SEC-5 · Reportes del portal ignoran `project_access`**
`lib/actions/time-entries.ts:524-529`, `lib/actions/reports.ts:37-57`
En la rama portal, `getTimeEntries` y `getClientReportAnalytics` filtran solo por `client_id`.
Con el filtro "Todos los proyectos", un stakeholder restringido ve registros de tiempo
(tarea, descripción, fecha, horas, timeline de breaks) y analíticas de **todos** los proyectos
del cliente. (El `<select>` de proyecto usa `getProjects`, que **también** filtra de más, así
que lista nombres de proyectos vedados — un leak adicional.)
**Fix:** resolver `getPortalProjectFilter()` y aplicar `taskProjectIdFilter` en ambas ramas.

### 🟡 MEDIO

**SEC-6 · `getClientBranding`: IDOR sin autenticación** — `lib/actions/reports.ts:11-26`
`findUnique({where:{id:clientId}})` que devuelve `name`+`logo_url` **sin ninguna llamada a
auth/contexto**. Cualquiera enumera `clientId`s y obtiene nombre comercial + logo de todos los
clientes. Bajo impacto (solo marca, no horas/montos), pero viola directamente la regla #1.
**Fix:** resolver el `clientId` del contexto (`getClientContext().clientId`).

**SEC-7 · Lecturas multi-stakeholder sin `project_access`**
`getInvoiceWithItems`/`getInvoices` (`invoices.ts:73,39`), `getProjects`/`getProjectWithRelations`
(`projects.ts:18,48`): la *emisión* de facturas valida conjuntos de stakeholders (F4.5), pero
la *lectura* solo filtra por `client_id`. Un stakeholder restringido lee facturas e items
(desglose por proyecto) y proyectos fuera de su `project_access`.
**Fix:** componer `projectIdFilter(getPortalProjectFilter())` en toda rama portal.

### 🟢 BAJO

- **`api/public/work-status` route**: el timer activo se devuelve por `client_id` sin
  `project_access` (fuga menor de nombre de proyecto/tarea a stakeholder restringido); y el
  fallback filtra hitos por `includes('[<clientName>]')` — un nombre substring de otro puede
  filtrar líneas ajenas. Match exacto del tag.
- **`rates.getRateContext`** (`rates.ts:41`): compara contra `user.id` en vez de `ownerId` →
  un team member **legítimo** recibe "No tenés acceso". Falla cerrada (no es fuga) pero rompe
  funcionalidad para el equipo.

### Patrón recomendado (volver el scoping a prueba de olvidos)
El problema raíz es que el scoping es **manual y opt-in**: basta un `findUnique({where:{id}})`
para abrir un IDOR. Tres niveles de solución, de menor a mayor fuerza:
1. **Guards de carga obligatoria** (`lib/auth/guards.ts`): `loadOwnedInvoice(id, ctx)` que
   internamente hace `findFirst({where:{id, clients:{user_id: ctx.ownerId}}})` y tira si no
   existe. Prohibir `findUnique({where:{id}})` sobre entidades de tenant. Generaliza el patrón
   correcto que ya existe en `ensureCanOperateEntry`.
2. **Un único punto de entrada por audiencia**: toda action portal arranca con
   `getPortalProjectFilter()` y compone SIEMPRE `taskProjectIdFilter`; toda action interna
   arranca con `getOwnerContext()` + gate de rol.
3. **RLS real**: correr Prisma con un rol Postgres **no privilegiado** que respete RLS
   (`SET LOCAL role` + `request.jwt.claims` por transacción). Convierte la RLS en el backstop
   que la regla #1 dice que debería ser. Estrella polar, no para ya.
4. **Gate de rol a nivel de ruta** (`layout.tsx` por segmento) para `/dashboard/invoices`,
   `/billing`, `/settings/team` — defensa en profundidad además del gate por action.

---

## 3. Facturación (foco)

### 🟠 ALTO

**BILL-1 · `hour_packages.hours_used` nunca se incrementa: el saldo de prepagos es ficticio**
`app/dashboard/hour-packages/page.tsx:126`, `lib/actions/invoices.ts` (transacción de facturación)
`hours_used` se escribe solo con `0` al crear (y se resetea a `0` al **editar** el paquete), y
se lee para las barras de progreso — pero **en ningún lado se suma** al facturar o cargar
horas. `createInvoiceFromTimeEntries` factura time_entries y nunca toca `hour_packages`. No hay
trigger que lo haga. Resultado: `remaining = hours − 0` siempre; la alerta "quedan pocas horas"
jamás se dispara.
**Impacto:** para Illinois (80hs Jeremías / 120hs Agustín) no hay forma de saber cuándo se agotó
un paquete ni de vincular las horas prepagas con la facturación. No hay doble-facturación del
*mismo* trabajo (lo impide `is_billed`+`invoice_id`), pero el control del prepago es decorativo.
**Fix:** definir la semántica (descontar `hours_used` atómicamente en la transacción de factura,
con `consumed_from_package_id` en `time_entries`, respetando `reserved_for_client_user_id` y un
`CHECK hours_used <= hours`), y mover la gestión a Server Action con `getOwnerContext` (hoy usa
el cliente Supabase directo). Si no se va a implementar ya, **documentar que es no-funcional**.

### 🟡 MEDIO

**BILL-2 · `recordPayment`: sin validación + race + sin reversa** — `lib/actions/payments.ts:31-77`
- No valida `amount > 0`: un monto **negativo, 0 o NaN** entra (el input HTML no tiene `min`;
  `parseFloat` puede dar NaN, y como toda comparación con NaN es `false`, queda `partial`).
- **Sobre-pago silencioso**: `totalPaid >= total` marca `paid` sin tope.
- **Race**: lee los pagos previos con un `findFirst` **fuera** de la transacción y suma sobre
  ese snapshot; dos pagos concurrentes leen lo mismo.
- **No hay `deletePayment`** que recalcule el estado al anular un pago mal cargado.
*(Atenuante: es owner-only y un solo operador humano → la race es improbable; lo accionable y
trivial es la validación y el tope de sobre-pago.)*
**Fix:** zod `amount.positive()`; recalcular `totalPaid` con un `aggregate` **dentro** de la
transacción; decidir política de sobre-pago; agregar `deletePayment`; `CHECK (amount > 0)`.

**BILL-3 · La matemática del dinero vive en dos lugares (TS + trigger) y usa floats**
`lib/actions/invoices.ts:352-409, 474-490`; `time-entries.ts:378-409, 1137-1253`
`subtotal`/`tax_amount`/`total_amount` se calculan **en JS con floats** y se persisten directo
en columnas `Decimal(10,2)` — contradice la regla de oro #2 ("el monto se calcula en DB"). El
`subtotal` y la suma de `invoice_items.amount` se calculan por caminos distintos → pueden
divergir ±1 centavo por proyecto extra (en facturas de 1 proyecto coinciden). Y `stopTimeEntry`
/`calculateEntryAmount`/`recalculateUnbilledEntries` recalculan `amount` en TS **además** del
trigger BEFORE que lo pisa → dos algoritmos de redondeo que mantener sincronizados.
*(El verificador confirmó que hoy ambos caminos convergen al mismo número en la práctica; el
riesgo es de mantenibilidad y auditoría, no de centavos visibles — salvo el subtotal multi-
proyecto.)*
**Fix:** elegir UNA fuente. Derivar `subtotal` de `SUM(invoice_items.amount)` (lo que ve el
cliente en el PDF) o moverlo a la DB; quitar el cálculo de `amount` en TS y re-leer la fila.

**BILL-4 · `updateInvoiceStatus`: sin máquina de estados, dos escritores del estado**
`lib/actions/invoices.ts:616-687`, `lib/validations/invoices.ts:29-32`
Acepta cualquiera de los 6 estados sin validar transiciones: se puede marcar `paid` una factura
**sin ningún pago** (`paid_at=now` pero `totalPaid=0`), o volver de `cancelled` a `sent`. El
estado lo gestionan `recordPayment` (derivado de pagos) **y** este setter manual, sin SSOT →
pueden contradecirse. `getClientBillingSummary` clasifica por ese `status`, así que un estado
mal seteado distorsiona el resumen financiero. `overdue` está en el enum pero **nadie lo
computa** desde `due_date`.
**Fix:** derivar `paid`/`partial` solo de pagos; restringir el setter a transiciones válidas;
computar `overdue` por `due_date < hoy` en las queries de listado.

### 🟢 BAJO

- **`generateInvoiceNumber`**: ordena por string `desc`; al pasar de `...-999` a `...-1000` el
  orden lexicográfico se rompe (`1000 < 999`) y entra en loop de colisión hasta fallar tras 3
  reintentos. Bomba de relojería (improbable >999/año). Ordenar por secuencia numérica.
- **Fallback de TC `1050` hardcodeado** (`invoices.ts:362,477`; `exchange.ts:3`;
  `billing/select/...:135`): en estrategia HISTORICAL, una entry sin `usd_exchange_rate` se
  pesifica a 1050 (desactualizado) → sub-facturación silenciosa. Abortar y pedir el TC real, o
  al menos advertir. Centralizar el `1050` en una constante (hoy repetido en 4 archivos).

---

## 4. Generación de PDF (foco)

> Hay **dos arquitecturas de PDF coexistiendo**: la VIVA (plantilla HTML
> `public/templates/invoice.html` + `lib/invoice-template.ts`, servida por
> `/api/invoices/[id]/pdf-html` e impresa con el diálogo del navegador) y la MUERTA (dos
> componentes `@react-pdf` que NO se importan en ningún lado). Lo bueno: el path vivo **lee los
> totales de la DB** (respeta la regla de oro), escapa HTML, formatea es-AR, y distingue
> correctamente INTERNAL (REMITO, sin QR/CAE) de LEGAL.

### 🟡 MEDIO

**PDF-1 · Dos plantillas react-pdf muertas, divergentes — una renderiza INTERNAL como factura fiscal falsa**
`components/invoices/invoice-pdf.tsx:111`, `components/invoices/invoice-preview-pdf.tsx:173`
`InvoicePDF` (279 líneas) e `InvoicePreviewPDF` (356 líneas) **no se importan en ningún `.tsx`**
(código muerto, ~635 líneas). Ya divergieron del template vivo: distinto nº de columnas, y
`invoice-pdf.tsx` **hardcodea** `FACTURA` + `C` + `COD. 011` + `Responsable Monotributo` +
bloque CAE **sin mirar `billing_type`**. Si alguien lo reconecta para "descargar PDF", un recibo
INTERNAL ("en negro") sale como **comprobante fiscal AFIP falso**.
**Fix:** borrar ambos componentes (`tsc --noEmit` para confirmar que no rompe imports). Dejar el
template HTML como única SSOT de layout. Para preview en pantalla, renderizar el mismo HTML en
un iframe, no un componente react-pdf paralelo.

**PDF-2 · Tablas DUPLICADO/TRIPLICADO desalineadas (4 celdas vs 6 columnas)**
`lib/invoice-template.ts:60`, `public/templates/invoice.html:154, 228, 300`
`buildItemsRows` emite filas con **4 `<td>`** y `{{ITEMS_ROWS}}` se reemplaza **globalmente** en
las 3 tablas. Pero la PAGE 1 (ORIGINAL) tiene 4 columnas y las PAGE 2/3 (DUPLICADO/TRIPLICADO)
tienen **6** (`Código | Producto | Cantidad | U.Medida | Precio | Subtotal`). Resultado: en las
copias, la descripción cae bajo "Código", el precio bajo la columna equivocada y faltan 2
columnas. Es un documento que recibe el cliente (Juntas Illinois). Los **montos son correctos**
(salen de la DB); el defecto es de maquetación.
**Fix:** unificar las 3 tablas a los 4 encabezados de PAGE 1 (no hay datos reales de "Código" ni
"U.Medida"). Agregar un test que valide `nº<th> == nº<td>` por tabla.

### 🟢 BAJO

- **Período "Hasta"** usa `start_time` de la última entrada, no su `end_time`
  (`pdf-html/route.ts:32`): una sesión que cruza medianoche imprime el día equivocado. Traer
  `end_time` y tomar el máximo.
- **QR del PDF legal** pedido a `api.qrserver.com` (servicio externo) con CUIT/monto/CAE en la
  URL (`invoice-template.ts:84`): falta si el tercero cae, y exfiltra datos fiscales. Generarlo
  local con `qrcode` (ya está en `package.json`) como `data:image/png;base64`. (Solo LEGAL.)
- **Impresión** vía `window.open` + `document.write` + `print()` con `setTimeout(500/2000ms)` y
  Google Fonts externas: salida no determinista (popup blocker, fuentes sin cargar). Para
  determinismo, render server-side con Puppeteer/Playwright del **mismo HTML**, o esperar
  `document.fonts.ready` y self-hostear las fuentes.
- **`@react-pdf` importado estático en el portal de reportes** (`client-portal/reports/page.tsx:35`):
  el dashboard lo hace con `next/dynamic({ssr:false})`, el portal no → infla el bundle inicial
  del cliente sobre conexiones lentas. Replicar el patrón dinámico (e idealmente también el
  `import` de `PDFReport`).

---

## 5. Modelo de datos & Integridad

### 🔴 CRÍTICO

**DATA-1 · `onDelete: Cascade` sobre datos fiscales — borrar un cliente destruye facturas con CAE**
`prisma/schema.prisma:571 (invoices→clients), :535 (invoice_items), :593 (payments)`;
`lib/actions/clients.ts:226-258 (deleteClient)`
Las FK hacia datos fiscales son **CASCADE físico**. `deleteInvoice` protege las facturas con CAE
("no se puede eliminar una factura autorizada"), pero ese guard es **solo de aplicación** y la
cascada de Postgres no lo respeta. Y `deleteClient` hace `prisma.clients.delete({where:{id}})`
**sin verificar facturas asociadas**. Borrar un cliente desde el panel — operación que parece
inocua — **destruye físicamente** todas sus facturas LEGAL con CAE, sus items y sus pagos, sin
recuperación. Argentina exige conservar comprobantes por años.
**Fix:** `invoices.client_id` (y `payments`/`invoice_items`) a `ON DELETE RESTRICT`, y/o
soft-delete del cliente con `deleted_at`. Como mínimo, `RESTRICT` en `invoices→clients` para que
la DB rechace el borrado; y `count` de facturas en `deleteClient`.

### 🟡 MEDIO

**DATA-2 · Los triggers de cálculo no están en migraciones versionadas**
`scripts/update_trigger.sql`, `supabase/fix_warnings.sql`, `scripts/*.ts`
La regla #2 asume que la DB calcula `duration_total`/`duration_neto`/`amount` por trigger, pero
**ninguna migración de `supabase/migrations/` los crea**. Los `CREATE TRIGGER` y cuerpos de
función viven dispersos en scripts `.ts`/`.js` committeados (`fix-db-logic.ts:54-66`,
`migrate-duration-neto.ts`, `harden-finance.ts`) con **versiones divergentes** entre sí (p.ej.
`update_trigger.sql` tiene el blindaje `billable=false` que `fix-db-logic.ts` no tiene). La
función `generate_invoice_number` no tiene cuerpo en el repo.
**Impacto:** un re-deploy desde cero (DR, staging) produce una DB **sin triggers** →
`duration_neto`/`amount` quedan en NULL/0 silenciosamente, rompiendo facturación sin error.
**Fix:** una migración idempotente que contenga el `CREATE OR REPLACE FUNCTION` + `CREATE
TRIGGER` explícitos + verificación post-deploy. Volcar `pg_get_functiondef`/`pg_get_triggerdef`
de producción al repo antes de que se pierdan.

**DATA-3 · Cero CHECK constraints sobre dinero/duración/rangos**
El único CHECK de dominio en `public` es `team_members.owner_id <> user_id`. No hay nada que
impida montos negativos (`payments.amount`, `invoice_items`, `time_entries.amount`),
`hours_used > hours`, ni `end_time < start_time`. Como Prisma bypasea RLS, un bug en código no
tiene red en la DB. *(Atenuante: zod ya cubre `time_entries`; el hueco más explotable es
`payments.amount`, sin validación ni CHECK.)*
**Fix:** CHECK idempotentes — `payments (amount>0)`,
`hour_packages (hours>=0 AND hours_used BETWEEN 0 AND hours)`,
`invoice_items (quantity>=0 AND rate>=0 AND amount>=0)`,
`time_entries (end_time IS NULL OR end_time>start_time; amount>=0; duration_neto>=0)`.

**DATA-4 · `invoice_number @unique` GLOBAL, no por-owner** — `schema.prisma:548`, `invoices.ts:191-211`
`generateInvoiceNumber` busca el último número por prefijo+año+tipo **sin scope de owner**.
Funciona con un solo emisor, pero MyKimai 2.0 es multi-user del proveedor: con un 2º owner,
`INT-2026-001` colisiona, la secuencia salta (enmascarado por los 3 reintentos), y un owner
**lee el conteo de facturas del otro** (fuga de información). AFIP exige numeración propia y
consecutiva por emisor.
**Fix:** unicidad compuesta `@@unique([owner_scope, billing_type, invoice_number])` y filtrar
el último número por owner. Idealmente, secuencia Postgres por `(owner, canal, año)` con
`UPDATE ... RETURNING` (atómico, sin read-modify-write — ver también la race de numeración).

### 🟢 BAJO / improvement

- **Trigger deja `amount` obsoleto** cuando `billable=true` pero `rate_applied IS NULL` o
  `duration_neto=0` (falta rama `ELSE` en `update_trigger.sql:22-28`): una entrada editada a
  duración 0 conserva su `amount` viejo. *El path de facturación recalcula desde `duration_neto`
  y lo sobreescribe, así que NO entran montos fantasma a las facturas* — el residuo es solo de
  display. Agregar `ELSE NEW.amount := 0`.
- **Campos de dinero nullable** (`amount`, `rate_applied`, `duration_total`) sin default,
  parcheados con `?? 0` en cada call-site. Los NULL son correctos para timers corriendo; el
  punto es centralizar la invariante (NOT NULL cuando `end_time IS NOT NULL`).
- **`currency` como `VarChar(3)` suelto** sin FK/enum ni validación de igualdad entre niveles
  (cliente/proyecto/entry pueden divergir).
- **Snapshots de milestones** (`actual_hours`/`actual_amount`) basados en `amount` que puede
  estar stale, sin recálculo al reabrir.
- **Índices**: redundancia parcial y falta de un compuesto `(client_id|task_id, start_time)`
  para el path `time_entries → tasks → projects → clients` + rango (medir con EXPLAIN antes).

---

## 6. Time tracking

> Diseño SSOT razonable (duración/monto en trigger, minutos enteros, `rate_applied` por evento).
> Los problemas son bugs de cálculo en bordes y deuda estructural.

### 🟡 MEDIO

- **Breaks solapados / desbordados** (`scripts/update_trigger.sql:11-18`): el trigger suma
  pausas **sin recortar al intervalo del entry ni fusionar solapamientos**; una pausa que excede
  `end_time` se resta entera → `duration_neto` puede quedar **negativo**, y por la condición
  `duration_neto > 0` el `amount` queda obsoleto. Alcanzable porque la UI permite editar breaks
  a mano. Reescribir el trigger con clamp `GREATEST(0, …)` + merge de intervalos.
- **`executeConsolidation` reprecia al `rate` de la primera entrada y pierde atribución de tarea**
  (`time-entries.ts:1004-1127`): agrupa por `(día, cliente)` y toma `first.rate_applied`/
  `first.task_id` para todo el grupo. Si el grupo mezcla tareas/tarifas, se reprecian mal. Es
  **destructivo** (`deleteMany` sin audit trail). Agrupar por `(día, task)` o no consolidar
  entradas con distinto `rate`/`task`; archivar en vez de borrar.
- **Sin control de concurrencia** (`time-entries.ts:231-304, 740-745`): `start`/`pause` hacen
  `findFirst`+`create` sin transacción ni índice único parcial → posibles **dos timers/dos
  pausas activas**; `update` es read-then-write sin lock → lost-update silencioso (ahora que es
  multi-user, owner y autor pueden editar la misma entrada). Agregar
  `UNIQUE INDEX ... ON time_entries(user_id) WHERE end_time IS NULL` y optimistic lock.
- **Cruce de medianoche** (`my-hours/page.tsx:303-316`, `DayTimeline.tsx`): los breaks se graban
  con la fecha de inicio del entry; `DayTimeline` asume un solo día (1440 min) y oculta la
  madrugada. Validar `end_time > start_time` y decidir política multi-día.

### 🟢 improvement

- **`time-entries.ts` (1261 líneas) mezcla 6+ responsabilidades**: timer CRUD, breaks, cascada
  de tarifas, recálculo masivo, consolidación, autorización. El gate `isAuthor/isWorkspaceOwner`
  está copiado **inline 5 veces** (existe `ensureCanOperateEntry` que lo encapsula pero solo lo
  usan 3 funciones); el cómputo `(neto/60)*rate` aparece en 4 lugares (existe
  `minutesToDecimalHours`, no se usa). Partir en `timer.ts`/`breaks.ts`/`consolidation.ts`/
  `billing-recalc.ts` y centralizar el helper de monto.

---

## 7. Performance & escala

> Funcionalmente correcto, pero diseñado para volúmenes chicos. A escala de años (time_entries
> es la tabla que más crece) degrada linealmente. Severidades ajustadas a **medio/bajo** porque
> el dataset actual es modesto; son deudas *forward-looking*.

- **Sin paginación** en Mis Horas / Facturas / Reportes / selección de facturación
  (`time-entries.ts:513`, `invoices.ts:56`): `getTimeEntries()` sin filtros trae **todo el
  workspace de todos los años** con includes anidados y lo renderiza sin virtualización. En 2-3
  años son miles de filas → varios MB de JSON y miles de nodos DOM por carga. Paginar por cursor
  sobre `start_time` (los índices `idx_time_entries_user_date`/`_start_time` ya existen); rango
  por defecto (últimos 90 días).
- **`getClientBillingSummary` agrega en JS** (`invoices.ts:692`) trayendo TODAS las facturas
  (incluidas pagadas históricas) + todas las entradas no facturadas, y hace `.filter()` del
  array completo por cada cliente — O(clientes × entradas) en cada carga de la pantalla de
  facturas. El monto facturado se puede resolver con `prisma.invoices.groupBy`; el no-facturado
  necesita un raw query que reproduzca la cascada `resolveRate`.
- **Reportes consultan time_entries dos veces** por carga (`reports/page.tsx:120`):
  `Promise.all([getTimeEntries, getClientReportAnalytics])` con el mismo WHERE — la analítica se
  puede derivar del dataset ya traído (o `groupBy` en SQL).
- **Over-fetching** en listados (`getInvoices` trae `clients` completo + `invoice_items` por
  fila; `getPortalProjects` trae todas las entries+breaks solo para sumar minutos). Usar `select`
  acotado / agregación SQL.
- **`createInvoiceFromTimeEntries`** hace `update` por fila dentro de la transacción
  (`invoices.ts:413`): N round-trips secuenciales con timeout de 15s → riesgo en cierres grandes.
  `updateMany` para los campos comunes + `UPDATE ... FROM (VALUES …)` para los distintos.

---

## 8. Reportes, Stats & Portal

> `getDashboardStats` separa ingresos por moneda correctamente (fix F0) y filtra por `ownerId`.
> Los problemas: las fugas de portal ya listadas (SEC-4/5) + temas de fechas/monedas.

- **🟡 Bucketing temporal en UTC, no Argentina** (`reports.ts:91`, `portal.ts:280-287`): todas
  las agregaciones por día/semana/mes usan la hora del proceso (UTC en Vercel). Trabajo cargado
  después de las **21:00 ART** se contabiliza en el **día siguiente** en los reportes que
  **audita el cliente** (riesgo de discusión); cerca de fin de mes, salta de mes. No afecta
  montos (los calculan triggers sobre el timestamp correcto). Normalizar a
  `America/Argentina/Buenos_Aires` con `date-fns-tz` y una constante TZ central. *(Nota:
  `HoursChart` es client component → agrupa en la zona del navegador, no sufre el bug server.)*
- **🟢 Semana arranca en domingo en el dashboard** (`stats.ts:142-143`) vs lunes en el chart y
  el portal → "X h esta semana" no cuadra con la gráfica de la misma página. Pasar
  `{ weekStartsOn: 1 }`.
- **🟢 `HoursChart` lee con supabase-js (anon key + RLS)** en vez de Server Action
  (`hours-chart.tsx:149-155`): único camino de stats que no pasa por Prisma+`ownerId`. Sin fuga
  hoy (RLS protege), pero inconsistente con la regla #1. Migrar a Server Action.
- **🟢 `totalUnpaidAmount` del portal suma monedas distintas** y no respeta proyectos
  restringidos (`portal.ts:44-53`): hoy es dead code (no se renderiza), pero repetiría el bug de
  mezcla USD+ARS que F0 corrigió. Agrupar por currency antes de exponerlo.

---

## 9. Calidad de código & Arquitectura

- **🟡 Sistema de tipos paralelo stale** (`lib/types/database.ts`): interfaz `Database` hecha a
  mano, **desincronizada de Prisma** (le faltan `billing_type`, `cae`, `tax_id`,
  `portal_user_id`, y tablas enteras: `team_members`, `milestones`, `project_access`,
  `payments`). Todavía la consumen 3 pantallas, forzando casts `as any`. Derivar todo de
  `@prisma/client`.
- **🟡 Cobertura zod inconsistente**: solo 5 de 16 archivos de actions validan. **Sin** zod:
  `payments` (¡el que mueve dinero!), `clients`, `projects`, `tasks`, `user-settings`,
  `reports`. CLAUDE.md dice que toda mutación debe validar. Crear `lib/validations/*` y
  `safeParse` al inicio, priorizando `payments` y `clients`.
- **🟡 Cero tests** en un sistema que factura dinero real. No hay vitest/jest ni script de test.
  La lógica pura de mayor riesgo (`resolveRate`, conversión ARS histórica, `generateInvoiceNumber`)
  es testeable sin DB. Instalar vitest; 15-20 tests sobre el dinero cubren el 80% del riesgo.
- **🟢 Manejo de errores inconsistente**: conviven `throw new Error` (afip, projects, portal,
  rates) y `return {error}` (el resto); varios catch devuelven el `error.message` **crudo de
  Prisma** al cliente (fuga menor de info interna). Estandarizar `ActionResponse<T>`, mapear
  `P2002`/`P2025` a mensajes de usuario, loguear el detalle solo en server.
- **🟢 Estructura de carpetas duplicada**: `hooks/` vs `shared/hooks/`, `contexts/` vs
  `shared/contexts/` (con re-exports triviales), `features/` con **un solo archivo huérfano**
  (`get-nav-stats.ts`, que nadie importa — dead code), tipos dispersos en `types/`/`lib/types/`/
  `shared/types/`. Colapsar a una convención y documentarla.
- **🟢 Archivos gigantes**: `time-entries.ts` (38KB), `invoices.ts` (27KB),
  `billing/select/[clientId]/page.tsx` (39KB, data fetching + preview + HTML + UI juntos).

---

## 10. Recomendaciones estratégicas (arquitectura)

1. **Tenant-scoping a prueba de olvidos** (ver §2). El riesgo #1. Guards obligatorios →
   eventualmente RLS real con rol no privilegiado.
2. **Numeración fiscal por-owner y atómica** (§5 DATA-4). Bomba latente que se activa con el 2º
   emisor. Secuencia Postgres por `(owner, canal, año)`. *(Nota positiva: la idempotencia del
   CAE con `pg_try_advisory_lock` + `updateMany WHERE cae IS NULL` ya está bien resuelta — el
   problema es la asignación del número, no el CAE.)*
3. **Resolver las ambigüedades de identidad antes de sumar stakeholders**:
   - `owner-context.ts:53-65` infiere el rol de "¿tiene clientes?" → el día que Lucio cree un
     cliente propio, queda atrapado en su workspace y pierde el de Lucas, silenciosamente. Hacer
     el rol **explícito** (una fila de membership donde el owner es `role='owner'`).
   - `clients.portal_user_id @unique` (1:1 legacy) compite con `client_users` (N:M nuevo).
     Deprecar `portal_user_id` migrando esos vínculos a `client_users`.
   - `sees_all_projects` default `true` es un deny-by-default invertido. Para clientes nuevos,
     default `false`.
4. **Reordenar el roadmap por irreversibilidad**: hoy F7 (soft-delete) y F8 (tests) están casi
   al final, pero el `Cascade` fiscal (§5 DATA-1) y la falta de tests de dinero son
   cofundacionales. Adelantarlos. El propio plan dice que los tests son "Prioridad 1" — hay una
   contradicción interna entre el plan y su orden.
5. **Extraer una capa de dominio pura** (`lib/domain/`): la regla de visibilidad de facturas
   está implementada **3 veces** (validación al crear, RLS SQL, filtro de portal) — 3 fuentes de
   verdad que se desincronizan. Funciones puras (`resolveInvoiceVisibility`, `computeEntryTotals`)
   sin `revalidatePath`/auth, testeables sin DB, consumidas por las actions delgadas.
6. **Unificar la generación de PDF** en una sola SSOT (§4): el template HTML, renderizado
   server-side si se quiere determinismo. Borrar los componentes react-pdf muertos.

---

## 11. Lo que está bien (no tocar)

- Separación limpia de doble auth (interno vs portal).
- Cascada de tarifas con SSOT (`resolveRate`) e inmutabilidad de `rate_applied` por evento.
- Cálculo de duración/monto en DB por trigger (el concepto; la ejecución tiene los matices de §5).
- Idempotencia del CAE con advisory lock + `updateMany WHERE cae IS NULL` (mejor que lo que
  pedía el plan).
- Schema rico y multi-currency desde el día 1; patrón `ActionResponse<T>` uniforme.
- El patrón `ensureCanOperateEntry` — es exactamente el guard que hay que **generalizar** a todas
  las entidades.
- El nivel de autodocumentación (`IMPROVEMENT_PLAN.md`, `CLAUDE.md`, handoff).

---

## Apéndice — Resumen de severidades (verificadas)

| Sev | Hallazgo | Ubicación |
|-----|----------|-----------|
| 🔴 | Cross-tenant read: `getTimeEntries` clientId override | `time-entries.ts:564-572` |
| 🔴 | AFIP emisión/anulación sin ownership ni rol | `afip-actions.ts:39,225` |
| 🔴 | `onDelete: Cascade` fiscal + `deleteClient` sin guard | `schema.prisma:571`, `clients.ts:250` |
| 🟠 | `calculateEntryAmount` muta monto cross-tenant | `time-entries.ts:1137` |
| 🟠 | `getPortalUnbilledSummary` ignora `project_access` | `portal.ts:143-202` |
| 🟠 | Reportes portal ignoran `project_access` | `time-entries.ts:524`, `reports.ts:47` |
| 🟠 | `hour_packages.hours_used` nunca se incrementa | `hour-packages/page.tsx`, `invoices.ts` |
| 🟡 | `recordPayment` sin validación + race + sin reversa | `payments.ts:31-77` |
| 🟡 | Dinero en JS floats + doble SSOT (TS vs trigger) | `invoices.ts:352`, `time-entries.ts:382` |
| 🟡 | `updateInvoiceStatus` sin máquina de estados | `invoices.ts:616-687` |
| 🟡 | Triggers no versionados en migraciones | `scripts/*.ts`, `update_trigger.sql` |
| 🟡 | 2 plantillas react-pdf muertas (INTERNAL→factura falsa) | `invoice-pdf.tsx`, `invoice-preview-pdf.tsx` |
| 🟡 | Tablas DUPLICADO/TRIPLICADO desalineadas | `invoice.html:228,300` |
| 🟡 | Sin CHECK constraints de dinero/duración | `schema.prisma` (varios) |
| 🟡 | `invoice_number @unique` global, no por-owner | `schema.prisma:548` |
| 🟡 | Tipos a mano stale (`database.ts`) vs Prisma | `lib/types/database.ts` |
| 🟡 | Cobertura zod inconsistente (payments/clients/…) | `lib/actions/*` |
| 🟡 | Cero tests | `package.json` |
| 🟡 | Sin paginación en listas que crecen | `time-entries.ts:513`, `invoices.ts:56` |
| 🟡 | Bucketing temporal en UTC, no Argentina | `reports.ts:91`, `portal.ts:280` |
| 🟡 | `getClientBranding` IDOR (name+logo) | `reports.ts:11` |
| 🟢 | Varios (numeración 999→1000, QR externo, breaks solapados, consolidación destructiva, archivos gigantes, week-start, etc.) | ver secciones |

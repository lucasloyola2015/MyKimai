# CHANGELOG - MyKimai

## [2026-02-05] - Estandarización técnica: Formato de 24 horas en todo el sistema
### Documentación (@chronicler)
*   **Estandarización técnica: Migración global a formato de 24 horas en todas las interfaces y componentes del sistema.**

### Interfaz y visualización (@designer)
*   **Vistas y listados**: Todas las tablas, cards y reportes muestran horas en **HH:mm** (ej: 14:30). Portal de cliente (proyectos, detalle de proyecto), Mis Horas, Time Tracker, Reportes y Billing usan el módulo central de formateo.
*   **Inputs y popups**: El selector de hora (`date-time-picker`) usa siempre **formatTime24** para valor y estado; el input `type="time"` tiene título y aria-description indicando formato 24h.
*   **Gráficas**: Los ejes temporales siguen mostrando periodos (día/semana/mes); las horas en tablas asociadas ya están en 24h.

### Lógica y formateo (@architect)
*   **Módulo central** `lib/date-format.ts`: **formatTime24** (HH:mm), **formatDateTime24** (dd/MM/yyyy HH:mm), **formatDateTime24Short** (dd/MM/yy HH:mm), **formatDate** (dd/MM/yyyy). Uso obligatorio para cualquier visualización o envío de hora.
*   **Intl**: Exportado **INTL_TIME_OPTIONS_24** con `hour12: false` para uso futuro; se evita cualquier formato 12h en locale.
*   **Barrido**: Reemplazadas todas las llamadas a `format(..., "HH:mm")` y `format(..., "dd/MM/yyyy HH:mm")` por las funciones del módulo en: `time-entries.ts`, `my-hours`, `time-tracker`, `reports`, `client-portal/projects`, `date-time-picker`.

### Resultado
*   No queda uso de AM/PM en popups, listados, reportes ni envío de datos. El sistema es consistente con el estándar internacional de 24 horas.

## [2026-02-05] - Implementación de Modo Oscuro nativo con persistencia y toggle
### Documentación (@chronicler)
*   **Implementación de Modo Oscuro nativo con persistencia de usuario y toggle en barra superior.**

### Estética Dark (@designer)
*   **Paleta modo oscuro**: Fondos en gris muy oscuro (`#121212` / `hsl(0,0%,7%)`) y cards en `hsl(0,0%,10%)`, evitando negro puro para reducir contraste. Bordes y muted en tonos cercanos para coherencia.
*   **Gráficas adaptadas**: En **PortalHoursChart**, **PortalProjectChart** y **HoursChart** (Root): rejilla (CartesianGrid), ejes (XAxis, YAxis) y leyendas usan colores legibles en fondo oscuro (grid `hsl(0,0%,25%)`, texto `hsl(215,15%,75%)`). Barras y tortas mantienen paleta distinguible en ambos modos.
*   **Transiciones**: `transition-colors duration-200` en `body` y en el toggle para cambio fluido entre temas.

### Persistencia y toggle (@architect)
*   **next-themes**: Integrado con `attribute="class"`, `defaultTheme="system"` y `enableSystem` para respetar la preferencia del sistema por defecto.
*   **Persistencia**: Preferencia guardada en `localStorage` bajo la clave `mykimai-theme` (SSOT), de modo que se mantiene al cerrar el navegador.
*   **Toggle en Navbar**: Componente **ThemeToggle** (iconos Sol/Luna) colocado a la izquierda del perfil de usuario en la **TopBar** del dashboard Admin y en la barra del **Client Portal** (desktop y móvil).

### Resultado
*   Modo oscuro aplicado a todas las vistas (Admin y Portal de cliente). La transición entre modos es fluida y las gráficas de horas y tortas se adaptan automáticamente.

## [2026-02-05] - Estandarización de métricas visuales: Ventana móvil de 7 periodos
### Documentación (@chronicler)
*   **Estandarización de métricas visuales: Implementación de ventana móvil de 7 periodos (Días/Semanas/Meses) en dashboards Root y Cliente.**

### Lógica de consulta y agregación (@architect)
*   **Regla de los 7**: Todas las vistas de gráficas de horas limitan el conjunto de datos a los **últimos 7 periodos** terminando en el periodo actual. **Vista Mes**: últimos 7 meses (ej. agosto a febrero). **Vista Semana**: últimas 7 semanas naturales. **Vista Día**: últimos 7 días de trabajo incluyendo hoy (ventana rolling).
*   **Portal** (`getPortalChartData` en `lib/actions/portal.ts`): día = 7 días terminando en hoy; semana = 7 semanas; mes = 7 meses. Navegación por `periodOffset` mantiene bloques de 7.
*   **Root** (`HoursChart`): misma lógica con Supabase; drill-down desde mes usa ventana de 7 semanas.

### Consistencia visual (@designer)
*   **Ancho y espaciado**: En ambos gráficos (Portal y Root) se usa `barCategoryGap="12%"` y `barGap={2}` para que las 7 barras ocupen el espacio de forma armónica y legible (PWA/móvil).
*   **Etiquetas del eje X**: Meses en español abreviado (ene, feb, …) con `date-fns` locale `es`. Vista día: etiquetas en formato "lun 5", "mar 6" (EEE d) para evitar solapamientos. Ángulo del eje reducido en vista día (-25°).

### Resultado
*   El sistema muestra siempre el contexto del último semestre/bimestre de trabajo de un vistazo, con comportamiento predecible y rápido en ambos dashboards.

## [2026-02-05] - Unificación de gestión de identidad: Sincronización atómica Clientes ↔ Supabase Auth
### Documentación (@chronicler)
*   **Unificación de gestión de identidad: Sincronización atómica entre la tabla de Clientes y Supabase Auth para cambios de email y password.**

### Lógica de actualización dual (@architect)
*   **Actualizar Cliente (updateClient)**: Si el cliente tiene `portal_user_id`, al modificar el **email** se llama a `supabase.auth.admin.updateUserById()` con el nuevo email y `email_confirm: true`, de modo que el login en el portal refleje el cambio de inmediato.
*   **Contraseña**: Al setear una nueva contraseña desde el panel Root (campo "Contraseña portal" al editar o al activar acceso web), se utiliza la API de Admin de Supabase (`updateUserById` o `createUser`) para que el cliente pueda loguearse con la nueva clave al instante. Se admite `newPassword` opcional en `updateClient` para resetear contraseña sin togglear acceso.
*   **Atomicidad**: Si la actualización en Supabase Auth falla, la base de datos local no se modifica; se devuelve error y no se persisten cambios para evitar desincronización.

### Seguridad y roles (@devops)
*   **Service Role Key**: El cliente de Supabase usado en el servidor (`createAdminClient`) utiliza `SUPABASE_SERVICE_ROLE_KEY` para gestionar usuarios sin requerir la sesión del cliente. Documentado en `lib/supabase/admin.ts`.
*   **Try/catch**: En `updateClient` y `toggleClientWebAccess`, las llamadas a Auth están envueltas en try/catch; ante fallo de Auth no se ejecuta la actualización en la base de datos.

### Resultado
*   El Root puede cambiar email y/o contraseña de un cliente y el acceso en el portal (jobs.loyola.com.ar) es efectivo de inmediato, con identidad unificada entre DB y Supabase Auth.

## [2026-02-05] - Implementación de navegación jerárquica (drill-down) sincronizada en portal de clientes
### Documentación (@chronicler)
*   **Implementación de navegación jerárquica (drill-down) sincronizada entre gráficas de barras y distribución por proyecto para el portal de clientes.**

### Lógica de navegación (@architect)
*   **Eventos de click en la gráfica de Horas trabajadas**: Reutilizada la lógica tipo Dashboard Root. Click en una barra de **Mes** → la vista baja a **Semanas** de ese mes; click en una barra de **Semana** → la vista baja a **Días** de esa semana.
*   **Sincronización del gráfico de torta**: El **PortalProjectChart** (Pie) es reactivo al nivel de zoom de la gráfica de barras. Vista mensual → torta muestra distribución global; al hacer drill en un mes → torta muestra solo ese mes; al bajar a un día → torta refleja solo las horas de ese día.
*   **Server actions**: Nueva `getPortalChartDataInRange(period, rangeStart, rangeEnd)` para datos de barras en un rango fijo (drill). `getPortalProjectDistribution(options?)` ampliada con `rangeStart`/`rangeEnd` opcionales para filtrar por período.

### UI y limpieza (@designer)
*   **Eliminación de tooltips**: Quitados los tooltips al pasar el mouse sobre las gráficas de barras y torta para mantener la interfaz limpia y minimalista.
*   **Botón «Volver»**: Indicador de navegación que aparece cuando el cliente está en vista de semana o día; permite regresar a la vista mensual con un solo clic.

### Resultado
*   Dashboard del cliente dinámico: exploración táctil y visual de tiempos por mes → semana → día, con la torta siempre alineada al período visible y sin ruido informativo.

## [2026-02-05] - Rediseño estético del Dashboard de Cliente e integración de gráficas
### Documentación (@chronicler)
*   **Rediseño estético del Dashboard de Cliente e integración de gráficas de actividad histórica y distribución de proyectos**.

### Estética y layout (@designer)
*   **Dashboard "Clean & Pro"**: Paleta basada en blancos, grises técnicos y azul de marca; se eliminan los gradientes saturados. Cards con borde sutil y fondo neutro.
*   **Tipografía**: Números y horas en **monospace** (`font-mono`, `tabular-nums`) para estética de ingeniería; títulos y etiquetas en sans-serif.
*   **Tres métricas clave** en la parte superior: [Horas este mes], [Proyectos activos] y [Última factura ARS/USD], con iconos minimalistas (Clock, FolderKanban, FileText).

### Analíticas (@architect)
*   **Gráfica de horas**: Reutilización del concepto del Dashboard Root (barras apiladas por período). Nuevo componente **PortalHoursChart** que consume `getPortalChartData(period, periodOffset)`; los datos se filtran por **clientId** de la sesión (solo proyectos del cliente). Vista por semana o mes con navegación anterior/actual.
*   **Gráfico de distribución**: **PortalProjectChart** (Pie Chart) con distribución de horas netas entre proyectos del cliente. Datos desde `getPortalProjectDistribution()` (solo entradas del clientId).
*   **Server actions**: `getPortalDashboardData` ampliado con `activeProjectsCount` y `lastInvoice` (total_amount + currency). Nuevas acciones `getPortalChartData` y `getPortalProjectDistribution` para las gráficas.

### Resultado
*   El dashboard del cliente carga de forma fluida y transmite transparencia y precisión técnica.

## [2026-02-05] - Unificación de visualización: Barra de Tiempo en desglose de tareas
### Documentación (@chronicler)
*   **Unificación de visualización: Integración de la Barra de Tiempo en el desglose de tareas para auditoría visual de jornadas**.

### Lógica de datos (@architect)
*   **getPortalProjectDetail**: La consulta ya incluía `breaks` en cada `time_entry`; ahora cada ítem de `timeEntries` devuelve también `breaks` (lista de periodos de descanso) para que el cliente pueda renderizar la misma barra de tiempo que en Mis Horas. Se pasan inicio de jornada (`start_time`), fin (`end_time`) y lista de descansos.

### UI (@designer)
*   **DayTimeline**: Añadida prop `compact` para variante minimalista (barra `h-1.5`, sin etiquetas 00h/24h), adecuada para tablas.
*   **Portal – Historial de Registros** (`/client-portal/projects/[id]`): En cada registro se reutiliza el componente **DayTimeline**: azul = tiempo trabajado, naranja = descansos, fondo blanco/slate = resto del día. La barra se inserta en una fila adicional bajo cada entrada (misma tabla), con `compact` y `max-w-xl` para mantener el diseño minimalista.

### Resultado
*   El cliente puede ver gráficamente en cada tarea cuánto tiempo se trabajó realmente frente a los descansos tomados ese día.

## [2026-02-05] - Evolución a Progressive Web App (PWA)
### Documentación (@chronicler)
*   **Evolución a Progressive Web App (PWA): Soporte para instalación nativa en iOS/Android y modo Standalone**.

### Manifest y assets (@architect)
*   **Web App Manifest** (`app/manifest.ts`): Incluye `name`, `short_name`, `start_url: "/"`, `display: "standalone"`, `background_color`, `theme_color` y orientación. Iconos 192x192 y 512x512 en `public/` para alta resolución (marca de ingeniería / reloj).
*   **Viewport**: `themeColor: "#2563eb"` en layout para barra de estado en modo standalone.

### Service Workers y offline (@devops)
*   **Service Worker** (`public/sw.js`): Cache de activos estáticos (JS, CSS, imágenes en `_next/static` y recursos en `/public`). Estrategia Network First con fallback a caché; en navegación sin red se sirve la página **Offline**.
*   **Página Offline** (`app/offline/page.tsx`): Vista minimalista cuando no hay conexión, con mensaje y botón "Reintentar". Pre-cacheada por el SW en `install`.
*   **Registro del SW** (`components/pwa/RegisterSW.tsx`): Registro en producción con `updateViaCache: "none"` para recibir actualizaciones.
*   **Headers** (`next.config.js`): Para `/sw.js`, `Content-Type: application/javascript` y `Cache-Control: no-cache` para que el navegador siempre compruebe la versión.

### Promoción de instalación (@designer)
*   **Banner de instalación** (`components/pwa/InstallBanner.tsx`): Se muestra cuando el navegador es compatible y la app no está instalada (no está en `display-mode: standalone`). En Chrome/Android usa `beforeinstallprompt` y botón "Instalar"; en iOS muestra texto para Compartir → "Añadir a pantalla de inicio". Dismissible con cierre y preferencia guardada en `localStorage`.

### Prueba
*   El sistema debe pasar el test de Lighthouse para PWA y permitir "Añadir a pantalla de inicio" para usar el sitio como aplicación independiente (sin barra del navegador en modo standalone).

## [2026-02-05] - Restricción de datos monetarios en portal de cliente
### Política de visibilidad (@chronicler)
*   **Restricción de datos monetarios en portal de cliente**: montos visibles exclusivamente en el módulo de facturación. La tarifa técnica por hora no se expone al cliente hasta el momento de cobro.

### Vistas de trabajo (@designer)
*   **Mis Proyectos** (`/client-portal/projects`): Eliminada la tarjeta "Inversión" (monto por proyecto). El cliente solo ve horas totales y estado.
*   **Detalle de proyecto / Historial de registros** (`/client-portal/projects/[id]`): Eliminadas columnas "Monto" y tarjeta "Inversión Total". Eliminado "Monto" del desglose por tarea. El cliente audita únicamente: Fecha, Descripción, Hora inicio, Hora fin, Horas netas y Estado (Facturado/Pendiente).

### Lógica de facturación (@architect)
*   **Horas no facturadas**: Nueva sección en `/client-portal/invoices` que es la única zona donde el cliente puede ver el valor acumulado (USD/ARS) por proyecto pendiente de facturar. Acción `getPortalUnbilledSummary()` en `lib/actions/portal.ts`.
*   **Facturas realizadas**: En la misma página el cliente ve solo el valor final (ARS o USD según factura), número de comprobante y CAE cuando corresponda; sin detalle de tarifa por hora.
*   **Backend**: `getPortalProjects()` y `getPortalProjectDetail()` dejan de incluir `total_amount` y `amount` en las respuestas para el portal, de modo que un usuario con rol CLIENT no reciba datos monetarios fuera del módulo de facturación.

## [2026-02-05] - Rediseño de portal de proyectos (Data-Driven Layout)
### Documentación (@chronicler)
*   **Rediseño de portal de proyectos hacia una interfaz de alta densidad de información (Data-Driven Layout)**.

### UI/UX (@designer)
*   **Eliminación de Cards**: La página `/client-portal/projects` pasa de un grid de tarjetas a una **tabla de datos compacta** con filas finas y paddings reducidos.
*   **Densidad**: Menos scroll; el cliente ve todos sus proyectos activos de un vistazo. Tipografía técnica con **monospace** para horas y fechas; **badges** pequeños para estado del proyecto (En curso/otro) y estado de facturación (Pendiente/Facturado/Sin registros).

### Estructura de datos (@architect)
*   **Campos por fila**: Nombre del proyecto (con descripción truncada opcional), Horas totales netas, Fecha del último registro, Estado del proyecto, Estado de facturación. Sin datos monetarios (privacidad; solo en Facturación).
*   **API**: `getPortalProjects()` ampliado con `last_entry_date` (ISO) y `billing_status` (`pending` | `invoiced` | `none`) para alimentar la tabla.

## [2026-02-05] - Refactorización masiva UI Responsive y Mobile-First
### Documentación (@chronicler)
*   **Refactorización masiva de UI para cumplimiento de estándares Responsive y Mobile-First en todo el ecosistema (Admin y Client Portal)**.

### Navegación y layout (@designer)
*   **Dashboard**: Contenedor principal con `w-full max-w-full`, padding lateral reducido en móvil (`px-3 sm:px-4`), `overflow-x-hidden` para evitar desbordamiento horizontal.
*   **Client Portal**: Menú hamburguesa en pantallas &lt; 768px: navegación fija reemplazada por botón de menú que abre panel deslizable (derecha) con enlaces y Salir; desktop mantiene barra horizontal. Contenedor fluido con `w-full max-w-full` y padding mínimo.
*   **Admin**: Barra lateral ya tenía menú colapsable (hamburguesa) en móvil; botón de menú con área táctil mínima 44px.

### Contenedores y tablas (@designer)
*   **Tablas adaptativas**: En portal de cliente (Proyectos y Facturación) las tablas van dentro de `overflow-x-auto` con `-webkit-overflow-scrolling: touch` y `min-width` en la tabla para permitir scroll horizontal en móviles sin romper el layout; se mantiene la legibilidad.

### Componentes UI (@architect)
*   **Botones**: `min-h-[44px]` y `touch-manipulation` en variantes default/sm/icon para área de contacto operable con el pulgar (accesibilidad móvil).
*   **Inputs**: `min-h-[44px]` y `touch-manipulation` para campos de formulario táctiles.
*   **Modales (Dialog)**: En móviles `w-[95vw]`, `max-h-[90vh] overflow-y-auto`, padding reducido (`p-4 sm:p-6`); botón de cerrar con `min-h-[44px] min-w-[44px]` para cierre fácil con el dedo.

### DevOps / consistencia
*   Layouts de dashboard y client-portal unificados en criterios Mobile-First: ancho 100%, sin overflow horizontal, paddings laterales mínimos.

## [2026-02-05] - Optimización de persistencia de sesión (Recordar sesión)
### Documentación (@chronicler)
*   **Optimización de persistencia de sesión mediante ajuste de expiración de cookies y auto-refresh de tokens**: La opción "Recordar sesión" no persistía al cerrar el navegador; se corrigió la gestión de cookies en middleware y cliente.

### Configuración de Supabase (@architect)
*   **Cliente navegador** (`lib/supabase/client.ts`): Opciones explícitas `persistSession: true` y `autoRefreshToken: true` para que el JWT se refresque correctamente y la sesión persista cuando la pestaña está cerrada.
*   **Cookies de auth**: Almacenamiento explícito vía cookies con duración según "recordar sesión" (getAuthCookieOptions); el cliente ya usaba storage basado en cookies.

### Middleware y cookies (@devops)
*   **Middleware** (`lib/supabase/middleware.ts`): Corregido bug crítico en el que cada llamada a `set`/`remove` de cookies creaba una nueva `NextResponse` y se perdían los demás `Set-Cookie`. Ahora se usa una única respuesta y todas las cookies de sesión (refresco de tokens) se escriben en ella.
*   **Opciones de cookies** (`lib/auth/remember-session.ts`): Añadido `Secure: true` en producción (NODE_ENV === "production") y mantenidos `path: "/"` y `SameSite=Lax`. Con "Recordar sesión", las cookies de auth tienen `maxAge: 30` días (REMEMBER_MAX_AGE); sin marcar, sesión (sin maxAge, se pierde al cerrar navegador).

### Prueba
*   Cerrar navegador, volver a entrar y verificar que la sesión sigue activa sin pedir credenciales cuando "Recordar sesión" estuvo marcada al iniciar.

## [2026-02-05] - Unificación estética del portal de clientes (Diseño Instrumental Compacto)
### Documentación (@chronicler)
*   **Unificación estética del portal de clientes bajo el estándar de 'Diseño Instrumental Compacto'**: Proyectos y Facturación comparten el mismo lenguaje visual (tablas de datos, filas finas, tipografía técnica, badges compactos).

### UI/UX (@designer)
*   **Facturación** (`/client-portal/invoices`): Sustitución de tarjetas por **tabla de gestión compacta**. Jerarquía de información: Nº Comprobante (o ID interno), Fecha de emisión, Estado (Pagada/Pendiente/Borrador/Vencida), Monto final. Etiquetas de estado con colores sobrios (verde suave pagada, ámbar pendiente, rojo vencida, gris borrador). Tipografía monospace para números y fechas.
*   **Horas no facturadas**: Misma página pasa a **tabla compacta** (Proyecto, Horas netas, Monto pendiente) en lugar de grid de cards.
*   **Acceso a documentos**: Botón de acción minimalista (icono de descarga) por fila para descargar el PDF del comprobante.

### Lógica (@architect)
*   **Visualización dual de moneda**: El monto se muestra en la moneda en que fue emitida la factura (`invoice.currency`: ARS o USD), sin conversión en listado.
*   **Acceso al PDF**: Cada fila de factura incluye `PDFDownloadLink` con botón icono para descargar el comprobante.

## [2026-02-02] - Bugfix: Sincronización de timestamps en descansos
### Módulo: Gestión de Tiempo (Mis Horas)
*   **Bugfix**: Sincronización de timestamps en la edición de descansos para garantizar cálculos de horas netas precisos.
*   **Backend (@architect)**: La Server Action `updateTimeEntryBreak` envía siempre de forma explícita `start_time` y `end_time` a Prisma (actualización atómica), sin lógica de diff que pudiera filtrar la fecha inicial.
*   **UI (@designer)**: Formulario de edición de pausas con estado controlado por descanso (`breakFormValues`); los campos de hora inicio/fin están vinculados bidireccionalmente al estado y en cada `onBlur` se envían ambos valores al servidor, evitando que al modificar un campo se pierda el valor del otro.

## [2026-02-02] - Implementación de Acceso Externo (Portal de Clientes)
### Módulo: Gestión de Identidades y Portal
*   **Seguridad y Auth**: Integración con **Supabase Auth** para permitir el acceso externo a clientes. Los administradores pueden habilitar el acceso y definir una contraseña manual.
*   **Esquema de Base de Datos**: Extensión de la tabla `clients` con `web_access_enabled` (Boolean) y `portal_user_id` (vínculo directo con `auth.users`).
*   **Flujo de Activación**: Acción de servidor `toggleClientWebAccess` que automatiza la creación del usuario en Supabase Auth con los metadatos adecuados (`role: CLIENT`).
*   **UI Admin**: Inclusión de Card de 'Acceso Web' en la gestión de clientes con toggle y gestión de password.
*   **Portal de Cliente**: Dashboard simplificado y profesional para clientes (`/client-portal`) que permite visualizar:
    *   Resumen de horas trabajadas (mes actual vs anterior).
    *   Estado de facturación y facturas pendientes.
    *   Tipo de cambio USD oficial aplicado en tiempo real.
*   **Aislamiento de Datos (RLS)**: Definición de políticas de Row Level Security para asegurar que un cliente solo pueda leer sus propios proyectos, tareas, facturas y registros de tiempo.
*   **Corrección de Hidratación de Datos**: Resolución del bug que mostraba vistas vacías para clientes mediante la vinculación dinámica de `auth.uid()` con el esquema relacional a través de `getClientContext()`.
*   **Redirección Automática**: Clientes con rol activo son redirigidos automáticamente al `/client-portal` desde la raíz y desde cualquier ruta del `/dashboard`.
*   **Seguridad de UI**: Filtrado dinámico de la barra lateral para ocultar los módulos de "Clientes" y "Time Tracker" cuando un cliente accede al dashboard.
*   **Estado de UI Profesional**: Implementación de Skeletons y manejo avanzado de estados vacíos y errores de vinculación en el portal.

## [2026-02-02] - Corrección de Lógica de Cálculo
### Módulo: Gestión de Tiempo
*   **Regla de Ingeniería**: Implementación estricta de `Horas Facturables = (Fin - Inicio) - Pausas`.
*   **Backend**: Refactorización de `lib/actions/time-entries.ts` con cálculo de alta precisión y recalibración dinámica en cada consulta.
*   **Bimonetariedad**: Integración de facturación en ARS/USD. Los registros capturan el Dólar Oficial del día trabajado (dolarapi.com) para pesificaciones históricas precisas.
*   **Conversión Adaptativa**: El sistema ahora permite elegir entre "Cotización Actual" (ideal para inflación, aplica el TC de hoy a todas las horas netas) o "Cotización Histórica" (ideal para deflación o estabilidad, usa el TC persistido de cada jornada).
*   **Normalización de Datos**: Ejecución de script de reparación masiva para poblar `usd_exchange_rate` en registros históricos (basado en `api.argentinadatos.com`).
*   **Reparación Estructural**: Restauración de la columna `updated_at` en `time_entries` para corregir la ejecución de triggers de base de datos en Supabase.
*   **Unidad de Medida**: Consolidación de la **Hora** como unidad de medida inmutable para liquidaciones; el monto monetario es una capa de cálculo dinámica basada en estrategias.
*   **UI Billing**: Nuevo selector de moneda y estrategia en la confección de facturas con desglose técnico detallado.
*   **Estrategia de Infraestructura**: Definición de escalabilidad mediante subdominios bajo un dominio raíz delegado en Cloudflare.
    *   *Acción*: Despliegue de **MedicalAI** en un subdominio dedicado para segregar entornos de ingeniería y salud.
*   **Sistema de Rollback**: Implementación de reversión para Facturas Internas.
    *   *Lógica*: Las facturas legales con CAE son inmutables; las internas pueden eliminarse liberando automáticamente las `TimeEntries` vinculadas para una nueva facturación.
    *   *Seguridad*: Operaciones atómicas mediante transacciones de Prisma para evitar orfandad de datos.

## [2026-01-30] - Sesión de Estabilización

### Módulo: Infraestructura y Despliegue

### Hitos
*   **Unificación de Ramas**: Sincronización exitosa de ramas `master` y `main` para despliegue consistente en Vercel.
*   **Limpieza de Telemetría**: Resolución del conflicto de puerto 7242 y limpieza de procesos locales.
*   **Configuración AFIP**: Setup exitoso de certificados electrónicos vía variables de entorno en Base64.
*   **Restauración de Sistema**: Recuperación de archivos de configuración (.agent, .cursor) eliminados accidentalmente.
*   **Formalización de Rol**: Creación de `@chronicler` y protocolo de continuidad de memoria.

### Pendientes (Siguiente Sesión) 📌
1.  **Facturación Parcial**: Implementar el selector de horas específicas para facturar ítems individuales.
2.  **Sistema de Facturación Dual**: Implementar canales de facturación Legal (AFIP) vs Interna con numeración independiente.
3.  **UI de Facturación**: Finalizar la lógica del selector en `app/dashboard/billing/select/[clientId]/page.tsx`.

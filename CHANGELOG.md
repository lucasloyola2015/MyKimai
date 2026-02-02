# CHANGELOG - MyKimai

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

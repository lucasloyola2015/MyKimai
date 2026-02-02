# CHANGELOG - MyKimai

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

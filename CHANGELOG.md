# CHANGELOG - MyKimai

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

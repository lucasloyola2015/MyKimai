---
description: 
---

# 📋 Workflow de Desarrollo Profesional (Next.js + Supabase)

Este protocolo es de cumplimiento obligatorio para todas las tareas de ingeniería en el proyecto. Divide las responsabilidades entre el pensamiento estructural y la ejecución estética.

---

### 0. Sincronización de Memoria (**@chronicler**)
*   **Acción**: Leer el último estado del `CHANGELOG.md`.
*   **Objetivo**: "Despertar" el contexto, resumir logros previos y validar la lista de 'Pendientes' para la sesión actual.
*   **Salida**: Resumen de estatus para @architect, @designer y @devops.

### 1. Introspección y Datos (**@architect**)
*   **Acción**: Consultar el esquema de la base de datos mediante la habilidad de **Prisma**.
*   **Objetivo**: Validar nombres de tablas, columnas y tipos de datos en **Supabase** antes de escribir código.
*   **Salida**: Confirmar si el esquema actual soporta la nueva funcionalidad o si requiere una migración.

### 2. Planificación de Diseño (**@designer**)
*   **Acción**: Proponer por chat la estructura del componente.
*   **Objetivo**: Detallar cómo se adaptará la UI a móviles y qué variables de **Tailwind CSS** se usarán.
*   **Restricción**: Debe cumplir con el estándar de "Diseño Compacto e Instrumental" y "Modo Oscuro" definido en las reglas.

### 3. Implementación Atómica (Colaborativo)
*   **Lógica (@architect)**: Crear los tipos de **TypeScript** y desarrollar las **Server Actions** para la comunicación segura con el backend.
*   **Interfaz (@designer)**: Construir la UI en Next.js utilizando componentes livianos y lógica **Mobile-First**.

### 4. Validación Técnica (**@architect**)
*   **Acción**: Ejecutar `npm run build` localmente antes de cualquier push.
*   **Objetivo**: Forzar la compilación de Next.js. Vercel falla si hay un solo error de TypeScript o un import mal referenciado (case-sensitive), algo que `npm run dev` suele ignorar.
*   **Prisma Check**: Ejecutar `npx prisma generate` para asegurar que el motor de consultas esté sincronizado con el build.

### 5. Test Visual E2E (**@designer**)
*   **Acción**: Utilizar la habilidad de **Puppeteer** para abrir el navegador en modo headless.
*   **Objetivo**: Verificar la responsividad en resoluciones móviles (ej. 390x844px) y confirmar que los datos se guardan correctamente en la DB.

### 6. Auditoría de Rendimiento (Ambos)
*   **Objetivo**: Garantizar que el componente no cause re-renders innecesarios y que el bundle final en **Vercel** sea ligero y rápido.

### 7. Deployment & Sync (**@devops**)
*   **Acción**: Realizar un commit semántico y hacer `git push origin main`.
*   **Objetivo**: Sincronizar cambios con el repositorio existente `https://github.com/lucasloyola2015/MyKimai`.
*   **Validación**: Verificar que el remoto esté configurado y usar las credenciales de Git de Windows.
*   **Entorno**: Asegurar que las variables locales coincidan con las de Vercel (especialmente `DATABASE_URL`).
*   **Push**: Solo se realiza el push si el build local del paso 4 fue exitoso (zero errors).
*   **Bimonetariedad Check**: Verificar que el cálculo `(H-P)*Rate*USD_Exchange` sea consistente en el backend antes de liberar a producción.

---

## ⚡ COMANDOS RÁPIDOS (Macros)

### > "Sincronizar proyecto"
Al recibir esta instrucción, el sistema ejecutará automáticamente la cadena de cierre:
1. **@architect**: Genera cliente Prisma (`npx prisma generate`).
2. **@architect**: Ejecuta build de producción (`npm run build`).
3. **@devops**: Si el build tiene **0 errores**, realiza commit y `push` a `MyKimai`.
4. **@devops**: Notifica el inicio del despliegue en Vercel.

---

## Roles

Los roles del workflow se definen en los siguientes archivos:

- **@chronicler** — `.agent/rules/chronicler.md` — Context & Continuity Specialist: gestión de CHANGELOG.md, memoria entre sesiones y auditoría de cambios técnicos.
- **@architect** — `.agent/rules/architect.md` — Senior Framework Architect: arquitectura Next.js/Supabase, Server Actions, type safety, Prisma, RLS.
- **@designer** — `.agent/rules/designer.md` — UI/UX Specialist: Mobile-First, diseño instrumental, Tailwind CSS, skeletos y estados visuales.
- **@devops** — `.agent/rules/devops.md` — Deployment & CI/CD Specialist: Git, Vercel, variables de entorno, builds y sincronización con el repositorio.
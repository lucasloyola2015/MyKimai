---
description: 
---

# 📋 Workflow de Desarrollo Profesional (Next.js + Supabase)

Este protocolo es de cumplimiento obligatorio para todas las tareas de ingeniería en el proyecto. Divide las responsabilidades entre el pensamiento estructural y la ejecución estética.

---

### 1. Introspección y Datos (**@architect**)
* **Acción**: Consultar el esquema de la base de datos mediante la habilidad de **Prisma**.
* **Objetivo**: Validar nombres de tablas, columnas y tipos de datos en **Supabase** antes de escribir código.
* **Salida**: Confirmar si el esquema actual soporta la nueva funcionalidad o si requiere una migración.

### 2. Planificación de Diseño (**@designer**)
* **Acción**: Proponer por chat la estructura del componente.
* **Objetivo**: Detallar cómo se adaptará la UI a móviles y qué variables de **Tailwind CSS** se usarán.
* **Restricción**: Debe cumplir con el estándar de "Diseño Compacto e Instrumental" y "Modo Oscuro" definido en las reglas.

### 3. Implementación Atómica (Colaborativo)
* **Lógica (@architect)**: Crear los tipos de **TypeScript** y desarrollar las **Server Actions** para la comunicación segura con el backend.
* **Interfaz (@designer)**: Construir la UI en Next.js utilizando componentes livianos y lógica **Mobile-First**.

### 4. Validación Técnica (**@architect**)
* **Acción**: Ejecutar chequeos de tipos (linting) y validar la integridad de los datos.
* **Objetivo**: Asegurar que no existan errores de precisión en cálculos de tiempo ni inconsistencias en las props.

### 5. Test Visual E2E (**@designer**)
* **Acción**: Utilizar la habilidad de **Puppeteer** para abrir el navegador en modo headless.
* **Objetivo**: Verificar la responsividad en resoluciones móviles (ej. 390x844px) y confirmar que los datos se guardan correctamente en la DB.

### 6. Auditoría de Rendimiento (Ambos)
* **Objetivo**: Garantizar que el componente no cause re-renders innecesarios y que el bundle final en **Vercel** sea ligero y rápido.

### 7. Deployment & Sync (**@devops**)
* **Acción**: Realizar un commit profesional y subir los cambios a la rama `main` de GitHub.
* **Objetivo**: Disparar el despliegue automático en Vercel.
* **Validación**: Verificar que las variables de entorno (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) estén configuradas en el panel de Vercel para que Prisma funcione en producción.
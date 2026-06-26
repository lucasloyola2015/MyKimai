---
description: Vuelca el estado de la sesión actual en handoff.md para que un agente nuevo retome sin contexto previo.
---

Generá (o reescribí) el archivo `handoff.md` en la raíz del proyecto con el estado COMPLETO de la
sesión actual, pensado para que un **agente nuevo, sin ningún contexto previo**, pueda retomar
exactamente donde quedamos. La regla mental: si en la próxima sesión el usuario dice
*"HOLA, leé el handoff"*, con `handoff.md` + `CLAUDE.md` tiene que estar 100% al día.

Incluí estas secciones:

1. **Encabezado:** fecha de hoy (usá la fecha actual del entorno) y un título corto de la sesión.
2. **Estado actual — qué está VIVO y DÓNDE:**
   - **Git:** en qué rama estás, último commit de `main`, si hay un worktree activo y dónde
     (`.claude/worktrees/...`), y commits sin mergear/pushear.
   - **Deploy:** estado en Vercel (rama que despliega, URL de producción, dominio del portal
     `jobs.loyola.com.ar`), y si el último push está desplegado o no.
   - **Base de datos (Supabase):** migraciones SQL **pendientes de aplicar** en el SQL Editor
     (rutas exactas bajo `supabase/migrations/`), y cuáles ya están aplicadas. Esto es CRÍTICO:
     el código puede estar mergeado pero la DB no migrada.
   - **Ubicación de credenciales** (NUNCA el valor del secreto, solo dónde está: `.env.local`,
     variables de entorno en Vercel, etc.).
3. **Logros de esta sesión:** qué se hizo, con punteros a los archivos/Server Actions/migraciones
   relevantes y a las fases del `IMPROVEMENT_PLAN.md` que se cerraron o avanzaron.
4. **Pendientes y bloqueantes:** qué falta, qué requiere acción manual del usuario (típicamente
   *aplicar SQL en Supabase* o *configurar algo en Vercel/AFIP*), y qué espera a quién.
5. **Roadmap / próximos pasos** (ordenado por prioridad; referenciar las fases F0..F10 del
   `IMPROVEMENT_PLAN.md`).
6. **Runbook — cómo hacer las cosas:** comandos concretos y verificados. Como mínimo:
   - Levantar dev (`npm run dev`), build (`npm run build`), typecheck (`npx tsc --noEmit`),
     regenerar Prisma (`npx prisma generate`).
   - **Aplicar una migración:** abrir el `.sql` bajo `supabase/migrations/` y pegarlo en el
     SQL Editor de Supabase, en orden. Recordar que el SQL Editor envuelve cada query en una
     transacción (no usar `CREATE INDEX CONCURRENTLY`).
   - **Flujo git con worktrees:** cómo se trabajó (rama `claude/...` en `.claude/worktrees/...`),
     cómo mergear a `main` (`git merge --ff-only <rama>`), cómo pushear.
   - Cualquier verificación de DB útil (queries de auditoría de RLS, listar policies, etc.).
7. **Decisiones clave:** resumen de las decisiones de arquitectura/diseño de la sesión, con
   puntero a la sección correspondiente del `IMPROVEMENT_PLAN.md` o `CHANGELOG.md`.

Reglas al generarlo:
- **NUNCA** incluyas secretos (claves de Supabase, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
  con password, tokens de AFIP, certificados base64). Solo su **ubicación** (ej. "la service role
  key está en `.env.local` y en las env vars de Vercel").
- Conciso pero completo y **accionable** (comandos copiables, rutas exactas, nombres de archivos
  de migración, URLs).
- Si `handoff.md` ya existe, **reescribilo** con la foto más reciente (es el estado de "hoy", no un
  historial acumulativo — para el historial están `CHANGELOG.md` y `IMPROVEMENT_PLAN.md`).
- Revisá la conversación de la sesión para capturar los detalles finos (lo último que se hizo, qué
  quedó a medias, decisiones nuevas, qué SQL falta aplicar).
- Tené en cuenta el punto ciego típico de este proyecto: **Prisma se conecta con `DATABASE_URL`
  (rol con privilegios) y BYPASEA la RLS**. Por eso el filtrado por `ownerId`/portal en el código
  es la primera línea de defensa y la RLS es defensa en profundidad. Si la sesión tocó visibilidad
  de datos, dejalo anotado.

Al terminar de escribir `handoff.md`:
- Mostrale al usuario un resumen de lo que quedó registrado.
- Recordale el cierre: **revisar `handoff.md` → `/clear` para limpiar el contexto**; en la sesión
  nueva, decir *"leé el handoff"*. `CLAUDE.md` = contexto durable del proyecto; `handoff.md` = la
  foto de la última sesión.
- No ejecutes `/clear` vos (es una acción del usuario); solo dejá `handoff.md` listo y avisá.

---
name: cerrar-jornada
description: Carga en MyKimai las horas trabajadas a partir de la evidencia de la jornada (sesiones y commits), o corrige horas ya cargadas. Usar al cerrar la jornada o la sesión, cuando pidan cargar o registrar horas de hoy u otro día, o editar horas de MyKimai.
---

# Cerrar jornada

Convierte la jornada en horas de MyKimai: **evidencia → propuesta → OK del usuario → carga**.
Estas horas se facturan a clientes reales y el cliente lee título y descripción en su portal:
cada hora cargada está respaldada por evidencia y aprobada por el usuario.

Herramientas: servidor MCP `mykimai` (`whoami`, `list_projects`, `list_time_entries`,
`check_time_slot`, `create_time_entry`, `update_time_entry`, …). Si no están disponibles, el MCP
no está conectado: guiá al usuario con [SETUP.md](SETUP.md) y retomá cuando esté.

## 1. Evidencia

Desde el repo de trabajo, corré el script del skill (`scripts/jornada.mjs` dentro de la carpeta
de este skill; en Claude Code, `${CLAUDE_SKILL_DIR}`):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/jornada.mjs"                    # hoy, hora de Argentina
node "${CLAUDE_SKILL_DIR}/scripts/jornada.mjs" --date 2026-10-01  # otro día ("ayer" → su fecha)
```

Devuelve **bloques** de actividad (sesiones de Claude Code del repo y sus worktrees + commits del
usuario), cortados por pausas de más de 45 min (`--gap <min>` para cambiarlo), redondeados a 5 min,
con `start_time`/`end_time` listos para la API y `repo`/`n` para el `external_ref`.

- Sumá lo que sabés de la conversación para saber qué se hizo en cada bloque; `git log -p` o los
  diffs completan el detalle.
- Un bloque `single_point` (un commit suelto) no tiene duración: preguntá cuánto duró, o descartalo.
- Si no hay evidencia de horario (otro agente, trabajo fuera de la sesión), pedile los horarios al
  usuario.

**Listo cuando:** cada bloque tiene inicio y fin respaldados por el script o dichos por el usuario.

## 2. Proyecto

Leé `.mykimai.json` en la raíz del repo: `{ "project_id": "<uuid>", "label": "Cliente / Proyecto" }`.
Si no existe, `list_projects`, preguntá a qué proyecto corresponde el trabajo y ofrecé crear el
archivo. Una jornada puede tocar varios proyectos: el proyecto se decide por bloque.

**Listo cuando:** cada bloque tiene un `project_id` que salió del archivo o del usuario.

## 3. Contenido

Por bloque, en español y escrito para el cliente (qué se logró, en sus términos):

- `title`: hasta ~80 caracteres.
- `description`: 2–4 líneas. Solo lo entregado al cliente: sin rutas internas, secretos ni
  detalles de las herramientas usadas.

**Listo cuando:** cada bloque tiene título y descripción.

## 4. Solapamientos

`list_time_entries` del día y `check_time_slot` de cada bloque con su `project_id`. Cada
solapamiento se le presenta al usuario con sus opciones (ver abajo) y él decide.

**Listo cuando:** cada solapamiento tiene una decisión explícita del usuario.

## 5. Propuesta

Mostrá una tabla: `# | proyecto | horario | horas | título | descripción | acción`
(acción = crear · completar `<id existente>` · paralelo confirmado) y el total del día. Esperá el
OK explícito; si pide cambios, aplicalos y volvé a mostrar la tabla.

**Listo cuando:** el usuario aprobó la tabla final.

## 6. Carga

- Crear: `create_time_entry` con `external_ref` = `<repo>:<date>:<n>` (del script). Re-correr el
  skill con el mismo `external_ref` actualiza esa hora en vez de duplicarla.
- `allow_overlap: true` va solo en los bloques que el usuario confirmó como trabajo en paralelo.
- Completar una hora existente: `update_time_entry` (título, descripción y/o horario).
- Si la API responde `conflict`, ese bloque vuelve al paso 4.

**Listo cuando:** cada bloque aprobado tiene su respuesta OK (id + `created`/actualizada).

## 7. Cierre

Resumí: horas por proyecto, total, ids, y lo que quedó sin cargar con su motivo. En la app, estas
horas aparecen con 🤖 en Mis Horas.

## Opciones ante un solapamiento

- **Mismo proyecto** (`same_project: true`): completar la hora existente · ajustar el horario del
  bloque · no cargar. La API rechaza siempre duplicar horas del mismo proyecto.
- **Otro proyecto**: cargar en paralelo (`allow_overlap: true` con el OK del usuario) · ajustar el
  horario · no cargar.
- Una hora existente con duración absurda (p. ej. un timer que quedó corriendo días): señalásela
  al usuario; corregirla es decisión suya.

## Editar horas ya cargadas

Pedidos del tipo "corregí/cambiá la hora de …": `list_time_entries` del día → mostrá la entrada →
proponé el cambio → OK → `update_time_entry` (si cambia el horario, antes `check_time_slot` con
`exclude_entry_id`). Las horas ya facturadas quedan fijas: la API responde `billed`.

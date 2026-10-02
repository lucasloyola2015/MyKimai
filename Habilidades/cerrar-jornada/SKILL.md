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
con `start_time`/`end_time` listos para la API y `repo`/`n` para el `external_ref`. Los bloques de
la franja 01:00–07:00 vienen aparte con `autonomous: true`: es **trabajo autónomo** de agentes y
se carga en entradas propias, con tarifa con descuento (ver paso 6).

- **La fuente de verdad son las sesiones apoyadas en git.** Un reloj de MyKimai que quedó prendido
  u olvidado no cuenta.
- Sumá lo que sabés de la conversación para saber qué se hizo en cada bloque; `git log -p` o los
  diffs completan el detalle.
- **El trabajo de los agentes se factura igual que el del usuario**: los lanza él, paga sus tokens
  y responde por el resultado. Un bloque largo en el que el usuario casi no escribe porque un agente
  está trabajando cuenta completo; nunca se descuenta por eso.
- Un bloque `single_point` (un commit suelto) no tiene duración: preguntá cuánto duró, o descartalo.
- Si no hay evidencia de horario (otro agente, trabajo fuera de la sesión), pedile los horarios al
  usuario.

**Listo cuando:** cada bloque tiene inicio y fin respaldados por el script o dichos por el usuario.

## 2. Proyecto

El script ya devuelve `project` (`project_id` + `label`) si el repo está mapeado: `.mykimai.json` en
la raíz del repo, o el mapa central `~/.mykimai/proyectos.json`
(`{ "C:/ruta/del/repo": { "project_id": "<uuid>", "label": "Cliente / Proyecto" } }`).
Si viene `null`, `list_projects`, preguntá a qué proyecto corresponde el trabajo y agregá el repo al
mapa central. Una jornada puede tocar varios proyectos: el proyecto se decide por bloque.

**Listo cuando:** cada bloque tiene un `project_id` que salió del mapa o del usuario.

## 3. Contenido

Por bloque, en español, para el cliente (lo lee en su portal y en el anexo de la factura). Sale de la
evidencia del bloque: `commits` y `prompts` (lo que pidió el usuario) que trae el script.

- `title`: **la tarea más importante del bloque**, dicha en concreto y hasta ~80 caracteres
  ("Acceso con token personal a las herramientas", "Pantalla de Recepción en el celular"). Un
  título genérico ("Correcciones varias", "Desarrollo", "Ajustes") no dice nada: si hubo varios
  temas, nombrá el principal y dejá el resto para la descripción. Al completar una hora existente
  con título genérico, proponé también el título nuevo.
- `description`: **concreta y llana**. Qué se hizo y qué quedó funcionando, con los nombres que el
  cliente reconoce (pantallas, máquinas, reportes, funciones). Frases cortas, verbos en pasado
  ("Se corrigió…", "Se agregó…") o sustantivos ("Corrección del…"). Va directo al hecho: sin relato,
  sin adjetivos de venta, sin justificar el tiempo, sin nombrar herramientas (Claude, IA, git), rutas
  internas ni secretos. Palabras del cliente, no jerga de programador: nada de CRUD, PR, API,
  commit ni deploy (vale para el título también); ABM sí se entiende.
- **El largo sigue a la duración**: una sesión corta hizo poco y se dice en pocas palabras; una
  larga hizo más y lleva más texto.

  | Duración del bloque | Largo de la descripción |
  |---|---|
  | menos de 1 h | una frase, hasta ~15 palabras |
  | 1 a 3 h | 1–2 frases, hasta ~35 palabras |
  | 3 a 6 h | 2–4 frases, hasta ~70 palabras |
  | más de 6 h | 4–7 frases, hasta ~120 palabras |

- **Un solo párrafo**: el portal y la factura no respetan saltos de línea ni viñetas. Para varios
  temas, frases separadas por punto o temas separados por punto y coma ("Recepción: …; Compras: …").

Ejemplos:
- 20 min: "Corrección del filtro de fechas en el reporte de horas."
- 2 h: "Se agregó el alta, edición y baja de listas de correo en la configuración. Quedó en producción."
- 5 h: "Recepción: la carga de fotos desde el celular quedó sin los botones de ayuda. Compras: el bot
  separa las órdenes en dos listas con su saldo. Se publicó la versión 1.103 en producción."

- **Trabajo autónomo** (`autonomous: true`): el título lo prefija solo el servidor con
  "Trabajo autónomo: "; la descripción dice qué revisó o produjo el agente y termina con
  "Trabajo autónomo de agente, facturado con descuento."

**Listo cuando:** cada bloque tiene título y una descripción concreta, del largo que corresponde a
su duración.

## 4. Solapamientos

`list_time_entries` del día y `check_time_slot` de cada bloque con su `project_id` (el cliente de
cada proyecto sale de `list_projects`). Resolvé cada solapamiento con las reglas de abajo y mostrá
la acción en la propuesta; lo que las reglas no cubran, preguntalo.

**Listo cuando:** cada solapamiento tiene una acción según las reglas o una decisión del usuario.

## 5. Propuesta

Mostrá una tabla: `# | proyecto | horario | horas | título | descripción | acción`
(acción = crear · completar `<id existente>` · paralelo confirmado) y el total del día. Esperá el
OK explícito; si pide cambios, aplicalos y volvé a mostrar la tabla.

**Listo cuando:** el usuario aprobó la tabla final.

## 6. Carga

- Crear: `create_time_entry` con `external_ref` = `<repo>:<date>:<n>` (del script). Re-correr el
  skill con el mismo `external_ref` actualiza esa hora en vez de duplicarla.
- `allow_overlap: true` va solo en los solapamientos que las reglas permiten (entre clientes
  Illinois) o que el usuario confirmó.
- Bloques `autonomous: true`: `create_time_entry` con `autonomous: true`. Van a la tarea "Trabajo
  autónomo" del proyecto, que tiene su propia tarifa con descuento (si no tiene precio, la cascada
  usa la del proyecto o la del cliente). Nunca se mezclan con las horas del usuario.
- Completar una hora existente: `update_time_entry` (título, descripción y/o horario).
- Si la API responde `conflict`, ese bloque vuelve al paso 4.

**Listo cuando:** cada bloque aprobado tiene su respuesta OK (id + `created`/actualizada).

## 7. Cierre

Resumí: horas por proyecto, total, ids, y lo que quedó sin cargar con su motivo. En la app, estas
horas aparecen con 🤖 en Mis Horas.

## Reglas ante un solapamiento

Reglas de Lucas (Illinois Jeremias, Illinois Agustin e Illinois Ezequiel son clientes distintos de
la misma empresa):

- **Mismo proyecto** (`same_project: true`): completar la hora existente · ajustar el horario ·
  no cargar. La API rechaza siempre duplicar horas del mismo proyecto.
- **Mismo cliente, otro proyecto**: no se cobra dos veces → unificar en un solo proyecto, o correr
  una franja a un hueco libre del mismo día.
- **Illinois contra Illinois** (clientes distintos): se cargan en paralelo (`allow_overlap: true`).
- **Illinois contra otro cliente**: **Illinois se queda con las horas; nunca se le recorta.** Se
  recorta la hora del otro cliente (si ya existe, `update_time_entry`).
- **Otros clientes entre sí**: se recorta lo nuevo para que no se superponga.
- Una hora existente con duración absurda (p. ej. un timer que quedó corriendo días): señalásela
  al usuario; corregirla es decisión suya.

## Editar horas ya cargadas

Pedidos del tipo "corregí/cambiá la hora de …": `list_time_entries` del día → mostrá la entrada →
proponé el cambio → OK → `update_time_entry` (si cambia el horario, antes `check_time_slot` con
`exclude_entry_id`). Las horas ya facturadas quedan fijas: la API responde `billed`.

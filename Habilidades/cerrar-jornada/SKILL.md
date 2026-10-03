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
node "${CLAUDE_SKILL_DIR}/scripts/jornada.mjs"                    # la fecha en curso, hora de Argentina
node "${CLAUDE_SKILL_DIR}/scripts/jornada.mjs" --date 2026-10-01  # otra fecha ("ayer" → su fecha)
```

Devuelve la **jornada** del proyecto del repo como `entries`: una entrada para la jornada de esa
fecha (07:00–21:00), de la primera a la última actividad, con sus `breaks` (pausas) en el medio,
lista para la API (`start_time`, `end_time`, `breaks`; `repo` y `date` para el `external_ref`), y
otra para su noche si hubo trabajo autónomo. Cómo se arma:

- **Actividad** = cualquier evento de las sesiones de Claude Code del repo y sus worktrees,
  **incluidos los subagentes en segundo plano**, más los commits del usuario. La fuente de verdad son
  las sesiones apoyadas en git: un reloj de MyKimai que quedó prendido u olvidado no cuenta.
- **El trabajo de los agentes se factura igual que el del usuario**: los lanza él, paga sus tokens
  y responde por el resultado. Si el usuario se va y deja agentes trabajando, el reloj sigue.
- **Pausa**: tras 1 hora sin ningún evento (todos los agentes terminaron y el usuario no volvió)
  empieza una pausa; termina cuando vuelve la actividad (`--pausa <min>` para cambiarlo). Las pausas
  son las nativas de MyKimai y no se cobran.
- **Trabajo autónomo**: la jornada de Lucas es de 07:00 a 21:00; lo que pasa de 21:00 a 07:00 del
  día siguiente lo hacen los agentes solos y sale como otra entrada, una por noche (puede cruzar la
  medianoche), con `autonomous: true` (ver paso 6).
- **Menos de 30 minutos trabajados no se registra** (queda en `discarded_short`). La API rechaza
  entradas así y no cuenta como solapamiento lo que pasa durante una pausa.
- Sumá lo que sabés de la conversación para saber qué se hizo; `git log -p` o los diffs completan el
  detalle. Si no hay evidencia de horario (trabajo fuera de las sesiones), pedile los horarios al
  usuario.

**Listo cuando:** cada entrada tiene inicio, fin y pausas respaldados por el script o dichos por el
usuario.

## 2. Proyecto

El script ya devuelve `project` (`project_id` + `label`) si el repo está mapeado: `.mykimai.json` en
la raíz del repo, o el mapa central `~/.mykimai/proyectos.json`
(`{ "C:/ruta/del/repo": { "project_id": "<uuid>", "label": "Cliente / Proyecto" } }`).
Si viene `null`, `list_projects`, preguntá a qué proyecto corresponde el trabajo y agregá el repo al
mapa central. Si la jornada tocó varios repos, corré el script en cada uno: una entrada por proyecto.

**Listo cuando:** cada entrada tiene un `project_id` que salió del mapa o del usuario.

## 3. Contenido

Por entrada, en español, para el cliente (lo lee en su portal y en el anexo de la factura). Sale de la
evidencia de la entrada: `commits` y `prompts` (lo que pidió el usuario) que trae el script.

- `title`: **la tarea más importante de la jornada**, dicha en concreto y hasta ~80 caracteres
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

  | Horas trabajadas | Largo de la descripción |
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

**Listo cuando:** cada entrada tiene título y una descripción concreta, del largo que corresponde a
su duración.

## 4. Solapamientos

`list_time_entries` del día y `check_time_slot` de cada entrada con su `project_id` (el cliente de
cada proyecto sale de `list_projects`). Resolvé cada solapamiento con las reglas de abajo y mostrá
la acción en la propuesta; lo que las reglas no cubran, preguntalo.

**Listo cuando:** cada solapamiento tiene una acción según las reglas o una decisión del usuario.

## 5. Propuesta

Mostrá una tabla: `# | proyecto | horario | horas | título | descripción | acción`
(acción = crear · completar `<id existente>` · paralelo confirmado) y el total del día. Esperá el
OK explícito; si pide cambios, aplicalos y volvé a mostrar la tabla.

**Listo cuando:** el usuario aprobó la tabla final.

## 6. Carga

- Crear: `create_time_entry` con `external_ref` = `<repo>:<date>:<n>` (del script) y sus `breaks`. Re-correr el
  skill con el mismo `external_ref` actualiza esa hora en vez de duplicarla.
- `allow_overlap: true` va solo en los solapamientos que las reglas permiten (clientes distintos en
  paralelo) o que el usuario confirmó.
- Entradas `autonomous: true`: `create_time_entry` con `autonomous: true`. Van a la tarea "Trabajo
  autónomo" del proyecto, que tiene su propia tarifa con descuento (si no tiene precio, la cascada
  usa la del proyecto o la del cliente). Nunca se mezclan con las horas del usuario.
- Completar una hora existente: `update_time_entry` (título, descripción y/o horario).
- Una hora con `external_ref` `auto:<project_id>:<fecha>[:autonomo]` la cargó el **agente de las 7**
  (ver abajo): si la jornada cubre ese mismo proyecto y día, completá esa hora con
  `update_time_entry` en vez de crear otra.
- Si la API responde `conflict`, esa entrada vuelve al paso 4.

**Listo cuando:** cada entrada aprobada tiene su respuesta OK (id + `created`/actualizada).

## 7. Cierre

Resumí: horas por proyecto, total, ids, y lo que quedó sin cargar con su motivo. En la app, estas
horas aparecen con 🤖 en Mis Horas.

## Reglas ante un solapamiento

Reglas de Lucas (Illinois Jeremias, Illinois Agustin e Illinois Ezequiel son clientes distintos de
la misma empresa):

- **Clientes distintos en paralelo**: la superposición vale y **ninguna de las dos se recorta**
  (`allow_overlap: true`): ninguno se entera del trabajo del otro. Vale también entre los tres
  clientes de Illinois.
- **Mismo cliente, dos proyectos en paralelo**: no se cobra dos veces → se **unifican en una sola
  hora continua**, en el proyecto con más tiempo trabajado; la descripción cuenta lo de los dos.
- **Mismo proyecto** (`same_project: true`): completar la hora existente · ajustar el horario ·
  no cargar. La API rechaza siempre duplicar horas del mismo proyecto.
- Una hora existente con duración absurda (p. ej. un timer que quedó corriendo días): señalásela
  al usuario; corregirla es decisión suya.

## Agente de las 7 (carga automática)

Todos los días a las 07:00 una tarea programada de Claude Desktop carga sola, sin propuesta, las
horas de la fecha anterior (su jornada y su noche de trabajo autónomo) de **todas** las carpetas
mapeadas, con estas mismas reglas (`scripts/sync.mjs`, lógica en `scripts/sync-core.mjs`). Lo que
no sabe resolver (carpeta sin proyecto, un proyecto ya cargado a mano con actividad de más) se lo
pregunta a Lucas en la sesión donde pasó. Procedimiento de la corrida: [AGENTE.md](AGENTE.md).

Cuando Lucas contesta una duda del agente en una sesión: mapeá la carpeta en
`~/.mykimai/proyectos.json` (o `"ignorar": true`; `"solo_esta_carpeta": true` para no cubrir las
subcarpetas), y cargá ese día con `node "${CLAUDE_SKILL_DIR}/scripts/sync.mjs" plan --date <fecha>`
→ textos (paso 3) → `apply`, como en [AGENTE.md](AGENTE.md), mostrándole antes la tabla.

## Editar horas ya cargadas

Pedidos del tipo "corregí/cambiá la hora de …": `list_time_entries` del día → mostrá la entrada →
proponé el cambio → OK → `update_time_entry` (si cambia el horario, antes `check_time_slot` con
`exclude_entry_id`). Las horas ya facturadas quedan fijas: la API responde `billed`.

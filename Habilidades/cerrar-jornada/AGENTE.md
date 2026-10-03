# Agente de horas de MyKimai

Dos procedimientos. La **corrida de las 7** (tarea programada `mykimai-agente-horas`, desatendida)
carga sola las horas y deja las dudas listas. El **reparto de dudas** lo hace una sesión atendida,
porque una corrida programada no puede escribir en otras sesiones, marcarlas ni desarchivarlas, y
su aviso de fin no despierta a ninguna sesión.

El script lee la API key solo; nunca la imprimas. Archivos de trabajo: `~/.mykimai/sync/`.

## Corrida de las 7

Se carga sin pedir OK: es la carga de todos los días y Lucas la revisa en Mis Horas (🤖). Lo que las
reglas no resuelven queda como duda, nunca como carga. Corré los comandos **con la herramienta Bash
y tal cual están escritos** (tienen permiso previo; cualquier variante pide aprobación y la corrida
se frena esperando a alguien que no está).

### 1. Plan

```bash
node C:/Users/loyol/.claude/skills/cerrar-jornada/scripts/sync.mjs plan
```

Procesa las fechas completas pendientes: cada una con su jornada (07:00–21:00) y su noche de
trabajo autónomo (21:00 → 07:00). Devuelve `actions` (`create` · `update` · `noop` · `skip` con
`reason`; `unified` lista los proyectos del mismo cliente que se sumaron a esa hora), `discarded`,
`doubts`, `ignored` y `skipped_days`. Si falla, ese error es el informe: saltá al paso 5.

**Listo cuando:** el comando terminó sin error (o su error es el informe).

### 2. Textos

Leé "## 3. Contenido" de `C:/Users/loyol/.claude/skills/cerrar-jornada/SKILL.md`: título y
descripción salen con esas reglas (para el cliente, concretos, el largo según `minutes`, trabajo
autónomo con su cierre). La evidencia de cada acción `create` está en la acción:
`evidence.prompts` (lo que pidió Lucas, con hora), `evidence.context_prompts` (el encargo previo
que los agentes siguieron ejecutando), `evidence.agent_tasks` (qué hizo cada subagente),
`evidence.commits` (con el repo entre corchetes), y `*_total` (cuántos hubo: la muestra está
repartida en toda la franja). En una hora unificada cada línea trae `[proyecto]`: la descripción
cuenta lo de todos. Lo que no está en la evidencia no se escribe.

**Listo cuando:** cada `create` del plan tiene título y descripción.

### 3. Carga

Los textos van por stdin, como JSON `{ "<ref>": { "title": "…", "description": "…" } }` (`{}` si no
hay `create`):

```bash
node C:/Users/loyol/.claude/skills/cerrar-jornada/scripts/sync.mjs apply --textos - <<'EOF'
{ "auto:…": { "title": "…", "description": "…" } }
EOF
```

Cada resultado es `create`/`update`/`noop`/`skip`, `error` (rechazo definitivo: pasa a duda) o
`retry` (falla pasajera o texto faltante: esa fecha se vuelve a procesar en la próxima corrida).

**Listo cuando:** apply devolvió sus resultados.

### 4. Dudas

```bash
node C:/Users/loyol/.claude/skills/cerrar-jornada/scripts/sync.mjs dudas
```

Deja `~/.mykimai/sync/dudas.json` con cada duda, su mensaje (`text`) y dónde pasó (`sessions`:
carpeta y franja). `pending` dice cuántas falta avisar.

**Listo cuando:** el comando terminó.

### 5. Informe

El último mensaje de la corrida es el informe, corto y en español:

- Por fecha: tabla `proyecto | horario | horas | título` de lo creado o ajustado, y el total.
- Lo descartado, lo salteado y los `retry`, una línea cada uno con su motivo.
- Las dudas, una línea cada una.
- `skipped_days`, si hay: fechas que no se cargaron por llevar más de una semana sin correr.
- Si `pending` > 0, la última línea: "N dudas para repartir: se reparten solas en la próxima sesión
  donde escribas (o pedí «repartí las dudas del agente de horas»)".

Si hay dudas, errores o retries: `PushNotification` (una línea, ej. "Horas de ayer cargadas: 7,5 h ·
2 dudas para revisar").

## Reparto de dudas (sesión atendida)

Lo dispara el hook `UserPromptSubmit` (`scripts/dudas-hook.mjs`, registrado en
`~/.claude/settings.json`): en la primera sesión donde Lucas escribe, si hay dudas sin repartir, le
pide a ese Claude que siga este procedimiento (como mucho una vez cada 2 h). También cualquier
sesión cuando Lucas lo pida.

1. Leé `~/.mykimai/sync/dudas.json`. Repartí solo las dudas con `notified_at: null`.
2. Elegí UNA sesión por duda: `mcp__ccd_session_mgmt__list_sessions` (`include_archived: true`,
   `limit: 100`), y entre las que tienen la misma carpeta (`cwd`) que alguna de `sessions` de la
   duda, la de `lastActivityAt` más cercana después del fin de esa franja. Nunca una corrida
   programada (títulos "MyKimai: agente de horas…" o "MyKimai: prueba…") ni esta misma sesión.
3. Para esa sesión: si está archivada, `mcp__ccd_session_mgmt__unarchive_session`; después
   `mcp__ccd_session_mgmt__send_message` con el `text` de la duda (varias dudas para la misma
   sesión van juntas, en un solo mensaje); después `mcp__ccd_sidebar__set_unread` (`true`) y
   `mcp__ccd_sidebar__set_pinned` (`true`). Si no hay sesión o el envío falla, la duda va completa
   en tu respuesta, para que Lucas la vea acá.
4. Marcá cada duda repartida con `notified_at` (ISO) en dudas.json.
5. Respondé en una línea por duda: a qué sesión fue, o el texto completo si no tiene sesión.

**Listo cuando:** cada duda pendiente tiene `notified_at` y Lucas tiene, por cada una, una sesión
marcada y fijada o el texto en tu respuesta.

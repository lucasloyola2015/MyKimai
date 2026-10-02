# Conectar un agente a MyKimai (MCP)

Una vez por máquina. Los pasos 1 y 2 los hace el usuario (la key no pasa por el chat).

## 1. Crear la API key

En MyKimai: menú del usuario (avatar) → **API keys** → **Nueva API key**.
Permisos: *Consultar* + *Cargar y editar mis horas* (finanzas solo si el agente debe ver montos y
facturas). Una key por máquina/agente. Se muestra una sola vez: copiarla.

## 2. Guardarla como variable de entorno del usuario (Windows, PowerShell)

```powershell
[Environment]::SetEnvironmentVariable("MYKIMAI_API_KEY", "mk_...pegar...", "User")
```

Cerrar y volver a abrir Claude (app y terminales) para que tome la variable.

## 3. Registrar el servidor MCP (Claude Code, para todos los repos)

Comillas **simples**, para que `${MYKIMAI_API_KEY}` llegue literal y Claude Code la lea de la variable:

```powershell
claude mcp add --transport http --scope user mykimai https://jobs.loyola.com.ar/api/mcp --header 'Authorization: Bearer ${MYKIMAI_API_KEY}'
```

## 4. Verificar

```powershell
claude mcp list
```

`mykimai` tiene que figurar como conectado. En una sesión, `whoami` devuelve el usuario y los
permisos de la key.

Si figura con error de autenticación, es que esa versión de Claude Code no expande variables en
servidores de usuario: borrarlo (`claude mcp remove mykimai -s user`) y registrarlo con la key
escrita en el header. Queda guardada en `~/.claude.json`, que es privado de tu usuario.

## 5. (Opcional) Proyecto por repo

En la raíz de cada repo, `.mykimai.json` evita preguntar el proyecto cada vez:

```json
{ "project_id": "<uuid de list_projects>", "label": "Cliente / Proyecto" }
```

## Otros agentes (Antigravity, etc.)

Es el mismo servidor MCP por HTTP: URL `https://jobs.loyola.com.ar/api/mcp` y header
`Authorization: Bearer <key>`. Copiar la carpeta `cerrar-jornada` donde ese agente lee sus skills.

## Revocar

MyKimai → API keys → revocar. El agente pierde el acceso al instante.

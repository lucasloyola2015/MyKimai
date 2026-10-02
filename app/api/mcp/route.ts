/**
 * Endpoint MCP (Streamable HTTP, stateless, respuestas JSON) para agentes de IA.
 *
 *   claude mcp add --transport http --scope user mykimai https://<dominio>/api/mcp \
 *     --header "Authorization: Bearer mk_..."
 *
 * Auth: API key personal (Authorization: Bearer). Sin cookie de sesión.
 * Cada request arma su propio servidor con el contexto de la key (ver lib/mcp/server.ts).
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { buildMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonRpcError(status: number, message: string, headers?: HeadersInit): Response {
    return Response.json(
        { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
        { status, headers }
    );
}

export async function POST(request: Request): Promise<Response> {
    const auth = await authenticateApiKey(request.headers.get("authorization"));
    if (!auth.ok) {
        return jsonRpcError(auth.status, auth.error, {
            "WWW-Authenticate": 'Bearer realm="mykimai"',
        });
    }

    const server = buildMcpServer(auth.ctx);
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless: Vercel no garantiza la misma instancia
        enableJsonResponse: true,
    });

    try {
        await server.connect(transport);
        return await transport.handleRequest(request);
    } catch (error) {
        console.error("[mcp] error manejando el request", error);
        return jsonRpcError(500, "Error interno del servidor MCP.");
    } finally {
        // En modo JSON la respuesta ya está completa: se puede cerrar.
        await server.close().catch(() => {});
    }
}

/** Stateless: no hay stream SSE de servidor ni sesiones que cerrar (spec MCP → 405). */
function methodNotAllowed(): Response {
    return jsonRpcError(405, "Método no permitido: usar POST.", { Allow: "POST" });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

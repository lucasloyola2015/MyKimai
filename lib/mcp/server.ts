/**
 * Servidor MCP de MyKimai para agentes de IA (Claude Code, etc.).
 *
 * Se arma uno por request (stateless) con el contexto de la API key ya
 * autenticada. Solo se exponen las herramientas que la key puede usar:
 * - 'read'       → consultas (clientes, proyectos, horas, resúmenes, paquetes, hitos).
 * - 'write'      → crear / editar horas propias; el owner, además, crear / editar clientes y proyectos.
 * - financials   → facturas, pendiente de facturar y gastos de proyecto (scope + rol owner/admin);
 *                  cargar gastos pide además 'write' y ser el owner.
 *
 * Toda la lógica y los filtros de seguridad viven en lib/domain/*.
 */

import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ApiContext } from "@/lib/auth/api-key";
import {
    checkTimeSlot,
    createEntry,
    listEntries,
    listProjects,
    updateEntry,
    type DomainResult,
} from "@/lib/domain/time-entries";
import { canManageWorkspace } from "@/lib/auth/owner-context";
import {
    createExpense,
    deleteExpense,
    listExpenses,
    updateExpense,
    uploadExpenseAttachment,
} from "@/lib/domain/expenses";
import { EXPENSE_ATTACHMENT_MIME_TYPES } from "@/lib/validations/expenses";
import { arDayKey } from "@/lib/timezone";
import { createClient, createProject, getClient, getProject, updateClient, updateProject } from "@/lib/domain/catalog";
import {
    getAccessSummary,
    getHoursSummary,
    getUnbilledSummary,
    listClients,
    listHourPackages,
    listInvoices,
    listMilestones,
} from "@/lib/domain/workspace";

const SERVER_INSTRUCTIONS = `MyKimai: registro de horas y facturación de Lucas Loyola (ingeniería freelance).

Reglas:
- Zona horaria del negocio: America/Argentina/Buenos_Aires (UTC-3). Al cargar o editar horas, las fechas van en ISO 8601 CON offset (ej. 2026-10-02T09:00:00-03:00). Para consultar se puede pasar un día YYYY-MM-DD (se toma completo en hora AR).
- Las horas se cargan por PROYECTO con un título libre (no hay tareas). Usá list_projects para obtener el project_id; no lo adivines.
- Si el cliente o el proyecto todavía no existen, el owner puede crearlos (create_client, create_project) y editar su configuración (update_client, update_project). Antes de crear, buscá con list_clients / list_projects para no duplicar, y confirmá con el usuario el nombre, el cliente y, si corresponde, la tarifa. Tocar tarifas, moneda o facturabilidad requiere acceso financiero y recalcula las horas sin facturar.
- Nunca inventes horarios: deben salir de evidencia (horarios de la sesión, commits, lo que diga el usuario).
- ANTES de crear o mover horas, llamá a check_time_slot. Si ya hay horas registradas en ese horario, mostráselas al usuario y preguntale qué hacer (completar la existente con update_time_entry, ajustar el horario, cargar en paralelo o no cargar). Nunca decidas solo.
  - Mismo proyecto: no se puede duplicar (la API lo rechaza siempre).
  - Otro proyecto: solo con confirmación explícita del usuario → allow_overlap=true. Criterio de Lucas: clientes distintos en paralelo valen y ninguno se recorta (Illinois Jeremias, Agustin y Ezequiel son clientes distintos); dos proyectos del MISMO cliente en paralelo se unifican en una sola hora continua.
- Usá external_ref estable (ej. "<repo>:<YYYY-MM-DD>:<n>") para que re-intentar no duplique.
- Las horas cargadas por API quedan marcadas con 🤖. No se pueden tocar horas ya facturadas. Los montos los calcula el sistema: nunca los mandes.
- Menos de 30 minutos trabajados no se registra. Una sesión corta solo entra si el mismo cliente retoma después de una pausa: se carga UNA entrada que abarca las dos sesiones, con la pausa en el medio (breaks). La pausa empieza tras 1 hora sin actividad. Lo que pasa durante una pausa no cuenta como solapamiento.
- Gastos de proyecto (compras, materiales, componentes que Lucas paga para un proyecto y le refactura al cliente): create_expense. Entran solos en la próxima factura del cliente como una línea de detalle (descripción + monto, sin descuento). El monto, la moneda y la fecha salen del comprobante o de lo que diga el usuario: nunca los inventes. Antes de cargar, buscá con list_expenses que no esté ya cargado y confirmá con el usuario proyecto, descripción, monto y moneda. La descripción la ve el cliente en la factura; proveedor, notas y comprobantes (add_expense_attachment: foto o PDF de la factura del proveedor) quedan solo en el sistema. Un gasto facturado no se puede editar ni borrar.
- Trabajo autónomo (la jornada de Lucas es de 07:00 a 24:00; de 00:00 a 07:00 trabajan solos los agentes): cargalo aparte con autonomous=true, una entrada por noche. Va a la tarea "Trabajo autónomo" del proyecto, con tarifa con descuento, y el título se prefija solo con "Trabajo autónomo: ".`;

const MAX_OUTPUT_CHARS = 200_000;

function ok(data: unknown): CallToolResult {
    let text = JSON.stringify(data, null, 2);
    if (text.length > MAX_OUTPUT_CHARS) {
        text = text.slice(0, MAX_OUTPUT_CHARS) + "\n… (salida truncada: acotá el rango o los filtros)";
    }
    return { content: [{ type: "text", text }] };
}

function error(message: string, extra?: Record<string, unknown>): CallToolResult {
    return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: message, ...extra }, null, 2) }],
    };
}

function fromDomain<T>(result: DomainResult<T>): CallToolResult {
    return result.ok
        ? ok(result.data)
        : error(result.error, { code: result.code, ...(result.details ? { details: result.details } : {}) });
}

/** Envuelve el handler: los errores inesperados no filtran internals al agente. */
function safe<A>(name: string, fn: (args: A) => Promise<CallToolResult>) {
    return async (args: A): Promise<CallToolResult> => {
        try {
            return await fn(args);
        } catch (err) {
            console.error(`[mcp] ${name} falló`, err);
            return error("Error interno al ejecutar la herramienta. Reintentá o avisale al usuario.");
        }
    };
}

// ─── Fragmentos de input schema ─────────────────────────────────────────────

const uuid = (what: string) => z.string().uuid().describe(`ID (UUID) de ${what}`);
const dayOrInstant = (edge: "desde" | "hasta") =>
    z
        .string()
        .describe(
            `Fecha ${edge}: YYYY-MM-DD (día completo en hora AR) o ISO 8601 con offset`
        );
const instant = (what: string) =>
    z.string().describe(`${what}: ISO 8601 con offset, ej. 2026-10-02T09:00:00-03:00`);
const scope = z
    .enum(["mine", "workspace"])
    .optional()
    .describe("'mine' (default): mis horas. 'workspace': las de todo el equipo (solo owner/admin)");
const allowOverlap = z
    .boolean()
    .optional()
    .describe(
        "Solo con confirmación EXPLÍCITA del usuario: permite solaparse con horas de OTROS proyectos (trabajo en paralelo). Con el mismo proyecto nunca se permite."
    );
const autonomous = z
    .boolean()
    .optional()
    .describe(
        "Trabajo autónomo de un agente (sin el usuario, de 00:00 a 07:00): va a la tarea 'Trabajo autónomo' del proyecto, que tiene tarifa con descuento. El título se prefija con 'Trabajo autónomo: '."
    );
const breaks = z
    .array(z.object({ start_time: instant("Inicio de la pausa"), end_time: instant("Fin de la pausa") }))
    .max(20)
    .optional()
    .describe(
        "Pausas dentro de la entrada (no se cobran). Se usan para unir una sesión corta (< 30 min) con otra del mismo cliente: una sola entrada con una pausa en el medio. En update_time_entry reemplazan todas las pausas ([] = ninguna)."
    );
const ymd = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Usar YYYY-MM-DD")
    .optional();
const toUtcDate = (d?: string) => (d ? new Date(`${d}T00:00:00Z`) : undefined);

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export function buildMcpServer(ctx: ApiContext): McpServer {
    const server = new McpServer(
        { name: "mykimai", version: "1.0.0" },
        { instructions: SERVER_INSTRUCTIONS }
    );
    const canRead = ctx.scopes.includes("read");
    const canWrite = ctx.scopes.includes("write");

    // ── Contexto (siempre) ──────────────────────────────────────────────────
    server.registerTool(
        "whoami",
        {
            title: "Quién soy",
            description:
                "Usuario, rol en el workspace y permisos de esta API key (si puede cargar horas o ver finanzas).",
            annotations: READ_ONLY,
        },
        safe("whoami", async () => ok(await getAccessSummary(ctx)))
    );

    // ── Consultas ('read') ──────────────────────────────────────────────────
    if (canRead) {
        server.registerTool(
            "list_clients",
            {
                title: "Listar clientes",
                description: "Clientes del workspace con cantidad de proyectos activos.",
                annotations: READ_ONLY,
            },
            safe("list_clients", async () => ok({ clients: await listClients(ctx) }))
        );

        server.registerTool(
            "list_projects",
            {
                title: "Listar proyectos",
                description:
                    "Proyectos del workspace (con su cliente). Usalo para obtener el project_id donde cargar horas.",
                inputSchema: {
                    client_id: uuid("cliente").optional(),
                    include_inactive: z
                        .boolean()
                        .optional()
                        .describe("Incluir proyectos pausados/terminados/cancelados (default: solo activos)"),
                },
                annotations: READ_ONLY,
            },
            safe("list_projects", async (a: { client_id?: string; include_inactive?: boolean }) =>
                ok({
                    projects: await listProjects(ctx, {
                        clientId: a.client_id,
                        includeInactive: a.include_inactive,
                    }),
                })
            )
        );

        server.registerTool(
            "list_time_entries",
            {
                title: "Listar horas",
                description:
                    "Horas registradas en un rango (máx. 366 días), con proyecto, título, descripción, horario, duración neta, si está facturada y si la cargó un agente (source='api').",
                inputSchema: {
                    from: dayOrInstant("desde"),
                    to: dayOrInstant("hasta"),
                    project_id: uuid("proyecto").optional(),
                    client_id: uuid("cliente").optional(),
                    scope,
                },
                annotations: READ_ONLY,
            },
            safe("list_time_entries", async (a: Parameters<typeof listEntries>[1]) =>
                fromDomain(await listEntries(ctx, a))
            )
        );

        server.registerTool(
            "get_hours_summary",
            {
                title: "Resumen de horas",
                description:
                    "Totales de horas terminadas agrupadas por día, semana o mes (hora AR), o por proyecto o cliente. Incluye facturables, ya facturadas y cubiertas por paquete.",
                inputSchema: {
                    from: dayOrInstant("desde"),
                    to: dayOrInstant("hasta"),
                    group_by: z.enum(["day", "week", "month", "project", "client"]).optional(),
                    project_id: uuid("proyecto").optional(),
                    client_id: uuid("cliente").optional(),
                    scope,
                },
                annotations: READ_ONLY,
            },
            safe("get_hours_summary", async (a: Parameters<typeof getHoursSummary>[1]) =>
                fromDomain(await getHoursSummary(ctx, a))
            )
        );

        server.registerTool(
            "check_time_slot",
            {
                title: "Ver horas en un horario",
                description:
                    "Devuelve MIS horas ya registradas que se solapan con un horario (los timers en curso cuentan). Llamala ANTES de crear o mover horas; si devuelve algo, preguntale al usuario qué hacer. `same_project=true` marca las del mismo proyecto (no se pueden duplicar).",
                inputSchema: {
                    start_time: instant("Inicio"),
                    end_time: instant("Fin"),
                    project_id: uuid("proyecto donde se quiere cargar").optional(),
                    exclude_entry_id: uuid("la entrada que se está editando (para excluirla)").optional(),
                },
                annotations: READ_ONLY,
            },
            safe("check_time_slot", async (a: Parameters<typeof checkTimeSlot>[1]) =>
                fromDomain(await checkTimeSlot(ctx, a))
            )
        );

        server.registerTool(
            "list_hour_packages",
            {
                title: "Paquetes de horas",
                description:
                    "Paquetes de horas prepagas por cliente/proyecto con horas usadas y restantes. Las horas cubiertas por un paquete no se facturan por hora.",
                inputSchema: {
                    client_id: uuid("cliente").optional(),
                    include_closed: z.boolean().optional().describe("Incluir vencidos/agotados (default: solo activos)"),
                },
                annotations: READ_ONLY,
            },
            safe("list_hour_packages", async (a: { client_id?: string; include_closed?: boolean }) =>
                ok({ packages: await listHourPackages(ctx, a) })
            )
        );

        server.registerTool(
            "list_milestones",
            {
                title: "Hitos",
                description: "Hitos de los proyectos con estado, fecha objetivo, horas presupuestadas y horas registradas.",
                inputSchema: {
                    project_id: uuid("proyecto").optional(),
                    include_closed: z.boolean().optional().describe("Incluir completados/cancelados"),
                },
                annotations: READ_ONLY,
            },
            safe("list_milestones", async (a: { project_id?: string; include_closed?: boolean }) =>
                ok({ milestones: await listMilestones(ctx, a) })
            )
        );
    }

    // ── Carga de horas ('write') ────────────────────────────────────────────
    if (canWrite) {
        server.registerTool(
            "create_time_entry",
            {
                title: "Cargar horas",
                description:
                    "Crea una entrada de horas TERMINADA (inicio y fin) en un proyecto, marcada con 🤖. La tarifa y el monto los calcula el sistema. Antes: check_time_slot y confirmación del usuario. Si external_ref ya existe, actualiza esa entrada en vez de duplicar.",
                inputSchema: {
                    project_id: uuid("proyecto"),
                    title: z.string().max(255).describe("Título corto de lo que se hizo"),
                    description: z.string().max(2000).optional().describe("Detalle (lo ve el cliente en reportes)"),
                    start_time: instant("Inicio"),
                    end_time: instant("Fin"),
                    external_ref: z
                        .string()
                        .max(255)
                        .optional()
                        .describe("Referencia estable para no duplicar al reintentar, ej. 'mykimai:2026-10-02:1'"),
                    allow_overlap: allowOverlap,
                    autonomous,
                    breaks,
                },
                annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            },
            safe("create_time_entry", async (a: Parameters<typeof createEntry>[1]) =>
                fromDomain(await createEntry(ctx, a))
            )
        );

        server.registerTool(
            "update_time_entry",
            {
                title: "Editar horas",
                description:
                    "Edita una entrada PROPIA y no facturada: título, descripción, horario o proyecto (cambiar de proyecto recalcula la tarifa). A un timer en curso solo se le cambian título y descripción.",
                inputSchema: {
                    entry_id: uuid("la entrada"),
                    project_id: uuid("proyecto nuevo").optional(),
                    title: z.string().max(255).optional(),
                    description: z.string().max(2000).nullable().optional(),
                    start_time: instant("Inicio nuevo").optional(),
                    end_time: instant("Fin nuevo").optional(),
                    allow_overlap: allowOverlap,
                    autonomous,
                    breaks,
                },
                annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            },
            safe("update_time_entry", async (a: Parameters<typeof updateEntry>[1]) =>
                fromDomain(await updateEntry(ctx, a))
            )
        );
    }

    // ── Clientes y proyectos ('write' + owner del workspace) ────────────────
    if (canWrite && canManageWorkspace(ctx)) {
        const clientFields = {
            email: z.string().max(255).nullable().optional().describe("Email de contacto ('' o null = sin email)"),
            phone: z.string().max(50).nullable().optional(),
            address: z.string().max(2000).nullable().optional(),
            notes: z.string().max(5000).nullable().optional(),
            currency: z.string().length(3).optional().describe("Moneda (ISO, ej. USD, ARS). Requiere acceso financiero"),
            default_rate: z.number().nonnegative().nullable().optional().describe("Tarifa por hora por defecto del cliente. Requiere acceso financiero"),
            is_billable: z.boolean().optional().describe("Si se le factura. Si pasa a false, sus proyectos también. Requiere acceso financiero"),
            tax_id: z.string().max(50).nullable().optional().describe("CUIT/CUIL"),
            business_name: z.string().max(255).nullable().optional().describe("Razón social"),
            legal_address: z.string().max(2000).nullable().optional().describe("Domicilio fiscal"),
            tax_condition: z.string().max(100).nullable().optional().describe("Condición frente al IVA"),
        };
        const projectFields = {
            description: z.string().max(5000).nullable().optional(),
            currency: z.string().length(3).optional().describe("Moneda (default: la del cliente). Requiere acceso financiero"),
            rate: z.number().nonnegative().nullable().optional().describe("Tarifa por hora del proyecto (null = usa la del cliente). Requiere acceso financiero"),
            billing_type: z.enum(["hourly", "fixed"]).optional().describe("Por hora (default) o precio fijo. Requiere acceso financiero"),
            status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
            start_date: z.string().nullable().optional().describe("YYYY-MM-DD"),
            end_date: z.string().nullable().optional().describe("YYYY-MM-DD"),
            is_billable: z.boolean().optional().describe("Si se factura (no se puede si el cliente no factura). Requiere acceso financiero"),
        };
        const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

        server.registerTool(
            "create_client",
            {
                title: "Crear cliente",
                description:
                    "Crea un cliente del workspace. Antes, list_clients para no duplicarlo y confirmá con el usuario el nombre y, si corresponde, la tarifa y los datos fiscales.",
                inputSchema: { name: z.string().min(1).max(255).describe("Nombre del cliente"), ...clientFields },
                annotations: WRITE,
            },
            safe("create_client", async (a: Parameters<typeof createClient>[1]) => fromDomain(await createClient(ctx, a)))
        );

        server.registerTool(
            "update_client",
            {
                title: "Editar cliente",
                description:
                    "Edita la configuración de un cliente (solo los campos que mandes). Cambiar tarifa o facturabilidad recalcula las horas sin facturar; las facturadas no cambian. Confirmá con el usuario antes de tocar tarifas.",
                inputSchema: { client_id: uuid("cliente"), name: z.string().min(1).max(255).optional(), ...clientFields },
                annotations: { ...WRITE, idempotentHint: true },
            },
            safe("update_client", async (a: Parameters<typeof updateClient>[1]) => fromDomain(await updateClient(ctx, a)))
        );

        server.registerTool(
            "create_project",
            {
                title: "Crear proyecto",
                description:
                    "Crea un proyecto de un cliente. Antes, list_projects para no duplicarlo y confirmá con el usuario el cliente, el nombre y, si corresponde, la tarifa (sin tarifa usa la del cliente).",
                inputSchema: { client_id: uuid("cliente"), name: z.string().min(1).max(255).describe("Nombre del proyecto"), ...projectFields },
                annotations: WRITE,
            },
            safe("create_project", async (a: Parameters<typeof createProject>[1]) => fromDomain(await createProject(ctx, a)))
        );

        server.registerTool(
            "update_project",
            {
                title: "Editar proyecto",
                description:
                    "Edita la configuración de un proyecto (solo los campos que mandes), incluido pasarlo a otro cliente (client_id). Cambiar tarifa, facturabilidad o cliente recalcula las horas sin facturar; las facturas emitidas no cambian. Confirmá con el usuario antes de tocar tarifas o mover de cliente.",
                inputSchema: {
                    project_id: uuid("proyecto"),
                    client_id: uuid("cliente nuevo").optional(),
                    name: z.string().min(1).max(255).optional(),
                    ...projectFields,
                },
                annotations: { ...WRITE, idempotentHint: true },
            },
            safe("update_project", async (a: Parameters<typeof updateProject>[1]) => fromDomain(await updateProject(ctx, a)))
        );
    }

    // ── Gastos de proyecto ('financials'; cargar: + 'write' y owner) ───────
    if (canRead && ctx.financials) {
        server.registerTool(
            "list_expenses",
            {
                title: "Gastos de proyecto",
                description:
                    "Gastos de proyecto (compras que se refacturan al cliente) con monto, moneda, proveedor, si ya están facturados y sus comprobantes. status='pending' = lo que entra en la próxima factura.",
                inputSchema: {
                    project_id: uuid("proyecto").optional(),
                    client_id: uuid("cliente").optional(),
                    status: z.enum(["pending", "billed", "all"]).optional().describe("Default 'all'"),
                    from: ymd.describe("Fecha del gasto desde (YYYY-MM-DD)"),
                    to: ymd.describe("Fecha del gasto hasta (YYYY-MM-DD)"),
                },
                annotations: READ_ONLY,
            },
            safe(
                "list_expenses",
                async (a: { project_id?: string; client_id?: string; status?: "pending" | "billed" | "all"; from?: string; to?: string }) =>
                    fromDomain(
                        await listExpenses(ctx, {
                            project_id: a.project_id,
                            client_id: a.client_id,
                            status: a.status,
                            from: toUtcDate(a.from),
                            to: toUtcDate(a.to),
                        })
                    )
            )
        );
    }

    if (canWrite && canManageWorkspace(ctx) && ctx.financials) {
        const expenseFields = {
            supplier: z.string().max(255).nullable().optional().describe("Proveedor (interno, no sale en la factura), ej. 'Mercado Libre — riotecno'"),
            amount: z.number().positive().describe("Monto pagado, tal cual el comprobante"),
            currency: z.enum(["ARS", "USD"]).describe("Moneda del monto pagado"),
            billable: z.boolean().optional().describe("Si se refactura al cliente (default true)"),
            notes: z.string().max(5000).nullable().optional().describe("Notas internas (no salen en la factura)"),
        };
        const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
        const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

        server.registerTool(
            "create_expense",
            {
                title: "Cargar gasto",
                description:
                    "Carga un gasto de un proyecto (una compra para el cliente). Entra en la próxima factura del cliente como una línea con la descripción y el monto. Antes: list_expenses para no duplicarlo y confirmación del usuario. Un duplicado exacto (proyecto, fecha, monto, moneda y descripción) se rechaza.",
                inputSchema: {
                    project_id: uuid("proyecto"),
                    description: z.string().min(1).max(500).describe("Qué se compró (sale en la factura), ej. 'Conversor serial RS232/RS485 a WiFi (HF2211A)'"),
                    expense_date: ymd.describe("Fecha de la compra YYYY-MM-DD (default: hoy, hora AR)"),
                    ...expenseFields,
                },
                annotations: WRITE,
            },
            safe(
                "create_expense",
                async (a: Omit<Parameters<typeof createExpense>[1], "expense_date"> & { expense_date?: string }) =>
                    fromDomain(await createExpense(ctx, { ...a, expense_date: toUtcDate(a.expense_date ?? arDayKey(new Date()))! }))
            )
        );

        server.registerTool(
            "update_expense",
            {
                title: "Editar gasto",
                description: "Edita un gasto NO facturado (solo los campos que mandes).",
                inputSchema: {
                    expense_id: uuid("el gasto"),
                    description: z.string().min(1).max(500).optional(),
                    expense_date: ymd.describe("YYYY-MM-DD"),
                    ...expenseFields,
                    amount: expenseFields.amount.optional(),
                    currency: expenseFields.currency.optional(),
                },
                annotations: { ...WRITE, idempotentHint: true },
            },
            safe(
                "update_expense",
                async ({ expense_id, expense_date, ...patch }: Omit<Parameters<typeof updateExpense>[1], "id" | "expense_date"> & { expense_id: string; expense_date?: string }) =>
                    fromDomain(await updateExpense(ctx, { id: expense_id, ...patch, expense_date: toUtcDate(expense_date) }))
            )
        );

        server.registerTool(
            "delete_expense",
            {
                title: "Borrar gasto",
                description: "Borra un gasto NO facturado y sus comprobantes. Solo con confirmación explícita del usuario.",
                inputSchema: { expense_id: uuid("el gasto") },
                annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
            },
            safe("delete_expense", async (a: { expense_id: string }) => fromDomain(await deleteExpense(ctx, a.expense_id)))
        );

        server.registerTool(
            "add_expense_attachment",
            {
                title: "Adjuntar comprobante",
                description:
                    "Adjunta a un gasto una foto o PDF (ej. la factura del proveedor), en base64, de hasta 3 MB. Queda solo en el sistema: no sale en la factura al cliente. Se puede adjuntar también a un gasto ya facturado.",
                inputSchema: {
                    expense_id: uuid("el gasto"),
                    file_name: z.string().min(1).max(255).describe("Nombre del archivo, ej. 'factura-ml.pdf'"),
                    mime_type: z.enum(EXPENSE_ATTACHMENT_MIME_TYPES),
                    content_base64: z.string().min(1).describe("Contenido del archivo en base64 (sin prefijo data:)"),
                },
                annotations: WRITE,
            },
            safe(
                "add_expense_attachment",
                async (a: { expense_id: string; file_name: string; mime_type: string; content_base64: string }) => {
                    const content = Buffer.from(a.content_base64.replace(/^data:[^,]*,/, ""), "base64");
                    if (content.length === 0) return error("El archivo está vacío o no es base64 válido.", { code: "invalid" });
                    if (content.length > MAX_ATTACHMENT_BYTES) {
                        return error("El archivo supera los 3 MB: adjuntalo desde la app.", { code: "invalid" });
                    }
                    return fromDomain(
                        await uploadExpenseAttachment(ctx, {
                            expense_id: a.expense_id,
                            file_name: a.file_name,
                            mime_type: a.mime_type,
                            content,
                        })
                    );
                }
            )
        );
    }

    if (canRead) {
        server.registerTool(
            "get_client",
            {
                title: "Ver cliente",
                description: "Configuración de un cliente: contacto, datos fiscales y (con acceso financiero) moneda y tarifa.",
                inputSchema: { client_id: uuid("cliente") },
                annotations: READ_ONLY,
            },
            safe("get_client", async (a: { client_id: string }) => fromDomain(await getClient(ctx, a.client_id)))
        );

        server.registerTool(
            "get_project",
            {
                title: "Ver proyecto",
                description: "Configuración de un proyecto: cliente, estado, fechas y (con acceso financiero) moneda, tarifa y tipo de facturación.",
                inputSchema: { project_id: uuid("proyecto") },
                annotations: READ_ONLY,
            },
            safe("get_project", async (a: { project_id: string }) => fromDomain(await getProject(ctx, a.project_id)))
        );
    }

    // ── Finanzas ('financials' + owner/admin) ───────────────────────────────
    if (canRead && ctx.financials) {
        server.registerTool(
            "list_invoices",
            {
                title: "Facturas",
                description:
                    "Facturas con estado (incluye 'overdue' derivado del vencimiento), total, pagado y saldo.",
                inputSchema: {
                    client_id: uuid("cliente").optional(),
                    status: z
                        .enum(["draft", "sent", "paid", "overdue", "partial", "cancelled"])
                        .optional(),
                    from: ymd.describe("Emitidas desde (YYYY-MM-DD)"),
                    to: ymd.describe("Emitidas hasta (YYYY-MM-DD)"),
                    limit: z.number().int().min(1).max(200).optional().describe("Default 50"),
                },
                annotations: READ_ONLY,
            },
            safe(
                "list_invoices",
                async (a: { client_id?: string; status?: string; from?: string; to?: string; limit?: number }) =>
                    fromDomain(
                        await listInvoices(ctx, {
                            client_id: a.client_id,
                            status: a.status,
                            from: toUtcDate(a.from),
                            to: toUtcDate(a.to),
                            limit: a.limit,
                        })
                    )
            )
        );

        server.registerTool(
            "get_unbilled_summary",
            {
                title: "Pendiente de facturar",
                description:
                    "Por cliente: horas terminadas, facturables, sin facturar y no cubiertas por paquete, con el monto calculado por el sistema.",
                inputSchema: { client_id: uuid("cliente").optional() },
                annotations: READ_ONLY,
            },
            safe("get_unbilled_summary", async (a: { client_id?: string }) =>
                fromDomain(await getUnbilledSummary(ctx, a))
            )
        );
    }

    return server;
}

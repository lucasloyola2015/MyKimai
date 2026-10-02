/**
 * Consultas de solo lectura del workspace para la API de agentes (MCP):
 * contexto, clientes, paquetes de horas, hitos, resumen de horas, facturas y
 * pendiente de facturar.
 *
 * ⚠️ NO es "use server" (recibe el contexto por parámetro). Regla de Oro #1:
 * todo filtra por `ctx.ownerId`. Los datos de plata solo salen con
 * `ctx.financials` (scope 'financials' + rol owner/admin). Regla de Oro #2:
 * los montos son los PERSISTIDOS (`amount` calculado por el trigger).
 */

import "server-only";
import { prisma } from "@/lib/prisma/client";
import { canSeeFinancials } from "@/lib/auth/owner-context";
import { arDayKey, arFormat, startOfWeekAr } from "@/lib/timezone";
import { zodErrorMessage } from "@/lib/validations/utils";
import {
    apiHoursSummarySchema,
    type ApiHoursSummaryInput,
} from "@/lib/validations/api-entries";
import { fail, type DomainResult, type EntryAccessContext } from "./time-entries";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Contexto ────────────────────────────────────────────────────────────────

export async function getAccessSummary(ctx: EntryAccessContext & { scopes?: string[] }) {
    const [actor, owner] = await Promise.all([
        prisma.users.findUnique({ where: { id: ctx.actorId }, select: { email: true } }),
        ctx.ownerId === ctx.actorId
            ? null
            : prisma.users.findUnique({ where: { id: ctx.ownerId }, select: { email: true } }),
    ]);
    return {
        user: { id: ctx.actorId, email: actor?.email ?? null },
        role: ctx.role,
        workspace_owner: owner ? { id: ctx.ownerId, email: owner.email } : "vos",
        scopes: ctx.scopes ?? [],
        can_see_financials: ctx.financials,
        can_see_team_hours: canSeeFinancials(ctx),
        timezone: "America/Argentina/Buenos_Aires",
    };
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export async function listClients(ctx: EntryAccessContext) {
    const clients = await prisma.clients.findMany({
        where: { user_id: ctx.ownerId },
        select: {
            id: true,
            name: true,
            business_name: true,
            currency: true,
            default_rate: true,
            is_billable: true,
            projects: { select: { status: true } },
        },
        orderBy: { name: "asc" },
    });
    return clients.map((c) => ({
        id: c.id,
        name: c.name,
        business_name: c.business_name,
        is_billable: c.is_billable,
        projects: {
            active: c.projects.filter((p) => p.status === "active").length,
            total: c.projects.length,
        },
        ...(ctx.financials
            ? {
                  currency: c.currency,
                  default_rate: c.default_rate != null ? Number(c.default_rate) : null,
              }
            : {}),
    }));
}

// ─── Paquetes de horas ───────────────────────────────────────────────────────

export async function listHourPackages(
    ctx: EntryAccessContext,
    input: { client_id?: string; include_closed?: boolean } = {}
) {
    const now = new Date();
    const packages = await prisma.hour_packages.findMany({
        where: {
            clients: { user_id: ctx.ownerId },
            ...(input.client_id ? { client_id: input.client_id } : {}),
        },
        select: {
            id: true,
            hours: true,
            hours_used: true,
            price: true,
            currency: true,
            purchased_at: true,
            expires_at: true,
            notes: true,
            clients: { select: { id: true, name: true } },
            projects: { select: { id: true, name: true } },
        },
        orderBy: { purchased_at: "asc" },
    });

    return packages
        .map((p) => {
            const hours = Number(p.hours);
            const used = Number(p.hours_used);
            const remaining = round2(hours - used);
            const expired = !!p.expires_at && p.expires_at < now;
            return {
                id: p.id,
                client: p.clients,
                project: p.projects ?? null,
                hours,
                hours_used: used,
                hours_remaining: remaining,
                status: expired ? "expired" : remaining <= 0 ? "exhausted" : "active",
                purchased_at: p.purchased_at.toISOString(),
                expires_at: p.expires_at ? p.expires_at.toISOString() : null,
                notes: p.notes,
                ...(ctx.financials ? { price: Number(p.price), currency: p.currency } : {}),
            };
        })
        .filter((p) => input.include_closed || p.status === "active");
}

// ─── Hitos ───────────────────────────────────────────────────────────────────

export async function listMilestones(
    ctx: EntryAccessContext,
    input: { project_id?: string; include_closed?: boolean } = {}
) {
    const milestones = await prisma.milestones.findMany({
        where: {
            projects: { clients: { user_id: ctx.ownerId } },
            ...(input.project_id ? { project_id: input.project_id } : {}),
            ...(input.include_closed ? {} : { status: { in: ["planned", "in_progress", "blocked"] } }),
        },
        select: {
            id: true,
            name: true,
            description: true,
            status: true,
            target_date: true,
            completed_at: true,
            budget_hours: true,
            budget_amount: true,
            budget_currency: true,
            projects: { select: { id: true, name: true, clients: { select: { name: true } } } },
        },
        orderBy: [{ project_id: "asc" }, { display_order: "asc" }],
    });

    const sums = milestones.length
        ? await prisma.time_entries.groupBy({
              by: ["milestone_id"],
              where: { milestone_id: { in: milestones.map((m) => m.id) }, end_time: { not: null } },
              _sum: { duration_neto: true },
          })
        : [];
    const minutesByMilestone = new Map(sums.map((s) => [s.milestone_id, s._sum.duration_neto ?? 0]));

    return milestones.map((m) => {
        const loggedHours = round2((minutesByMilestone.get(m.id) ?? 0) / 60);
        const budgetHours = m.budget_hours != null ? Number(m.budget_hours) : null;
        return {
            id: m.id,
            project: { id: m.projects.id, name: m.projects.name, client: m.projects.clients.name },
            name: m.name,
            description: m.description,
            status: m.status,
            target_date: m.target_date ? m.target_date.toISOString().slice(0, 10) : null,
            completed_at: m.completed_at ? m.completed_at.toISOString() : null,
            budget_hours: budgetHours,
            logged_hours: loggedHours,
            progress_pct: budgetHours ? Math.round((loggedHours / budgetHours) * 100) : null,
            ...(ctx.financials
                ? {
                      budget_amount: m.budget_amount != null ? Number(m.budget_amount) : null,
                      budget_currency: m.budget_currency,
                  }
                : {}),
        };
    });
}

// ─── Resumen de horas ────────────────────────────────────────────────────────

/** Totales de horas TERMINADAS agrupadas por día/semana/mes (hora AR) o por proyecto/cliente. */
export async function getHoursSummary(
    ctx: EntryAccessContext,
    input: ApiHoursSummaryInput
): Promise<DomainResult<unknown>> {
    const parsed = apiHoursSummarySchema.safeParse(input);
    if (!parsed.success) return fail("invalid", zodErrorMessage(parsed.error));
    const { from, to, project_id, client_id, scope, group_by } = parsed.data;

    if (scope === "workspace" && !canSeeFinancials(ctx)) {
        return fail("forbidden", "Tu rol solo puede consultar sus propias horas (scope 'mine').");
    }

    const entries = await prisma.time_entries.findMany({
        where: {
            ...(scope === "mine" ? { user_id: ctx.actorId } : {}),
            start_time: { gte: from, lte: to },
            end_time: { not: null },
            tasks: {
                projects: {
                    clients: { user_id: ctx.ownerId },
                    ...(client_id ? { client_id } : {}),
                    ...(project_id ? { id: project_id } : {}),
                },
            },
        },
        select: {
            start_time: true,
            duration_neto: true,
            billable: true,
            is_billed: true,
            amount: true,
            consumed_from_package_id: true,
            tasks: {
                select: {
                    projects: {
                        select: { id: true, name: true, currency: true, clients: { select: { id: true, name: true } } },
                    },
                },
            },
        },
    });

    type Group = {
        key: string;
        label: string;
        entries: number;
        minutes: number;
        billable_minutes: number;
        billed_minutes: number;
        package_minutes: number;
        amount_by_currency: Record<string, number>;
    };
    const groups = new Map<string, Group>();

    for (const e of entries) {
        const project = e.tasks.projects;
        let key: string;
        let label: string;
        switch (group_by) {
            case "week":
                key = label = arDayKey(startOfWeekAr(e.start_time));
                break;
            case "month":
                key = label = arFormat(e.start_time, "yyyy-MM");
                break;
            case "project":
                key = project.id;
                label = `${project.clients.name} / ${project.name}`;
                break;
            case "client":
                key = project.clients.id;
                label = project.clients.name;
                break;
            default:
                key = label = arDayKey(e.start_time);
        }
        const g =
            groups.get(key) ??
            {
                key,
                label,
                entries: 0,
                minutes: 0,
                billable_minutes: 0,
                billed_minutes: 0,
                package_minutes: 0,
                amount_by_currency: {},
            };
        const minutes = e.duration_neto ?? 0;
        g.entries += 1;
        g.minutes += minutes;
        if (e.billable) g.billable_minutes += minutes;
        if (e.is_billed) g.billed_minutes += minutes;
        if (e.consumed_from_package_id) g.package_minutes += minutes;
        if (ctx.financials && e.amount != null) {
            g.amount_by_currency[project.currency] = round2(
                (g.amount_by_currency[project.currency] ?? 0) + Number(e.amount)
            );
        }
        groups.set(key, g);
    }

    const rows = [...groups.values()]
        .sort((a, b) => (["day", "week", "month"].includes(group_by) ? a.key.localeCompare(b.key) : b.minutes - a.minutes))
        .map(({ amount_by_currency, ...g }) => ({
            ...g,
            hours: round2(g.minutes / 60),
            ...(ctx.financials ? { amount_by_currency } : {}),
        }));

    const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);
    return {
        ok: true,
        data: {
            from: from.toISOString(),
            to: to.toISOString(),
            group_by,
            scope,
            total: { entries: entries.length, minutes: totalMinutes, hours: round2(totalMinutes / 60) },
            groups: rows,
        },
    };
}

// ─── Finanzas (requieren ctx.financials) ─────────────────────────────────────

const FINANCIALS_REQUIRED =
    "Requiere el permiso 'financials' en la API key y rol owner/admin.";

export async function listInvoices(
    ctx: EntryAccessContext,
    input: { client_id?: string; status?: string; from?: Date; to?: Date; limit?: number } = {}
): Promise<DomainResult<unknown>> {
    if (!ctx.financials) return fail("forbidden", FINANCIALS_REQUIRED);

    const invoices = await prisma.invoices.findMany({
        where: {
            clients: { user_id: ctx.ownerId },
            ...(input.client_id ? { client_id: input.client_id } : {}),
            ...(input.from || input.to
                ? { issue_date: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
                : {}),
        },
        select: {
            id: true,
            invoice_number: true,
            status: true,
            billing_type: true,
            issue_date: true,
            due_date: true,
            paid_at: true,
            subtotal: true,
            tax_amount: true,
            total_amount: true,
            currency: true,
            cae: true,
            clients: { select: { id: true, name: true } },
            payments: { select: { amount: true } },
        },
        orderBy: { issue_date: "desc" },
        take: Math.min(input.limit ?? 50, 200),
    });

    const now = new Date();
    const rows = invoices.map((inv) => {
        // Igual que el listado de Facturas: "Vencida" se deriva de due_date.
        const overdue =
            (inv.status === "sent" || inv.status === "partial") && !!inv.due_date && inv.due_date < now;
        const paid = round2(inv.payments.reduce((s, p) => s + Number(p.amount), 0));
        const total = Number(inv.total_amount);
        return {
            id: inv.id,
            number: inv.invoice_number,
            client: inv.clients,
            status: overdue ? "overdue" : inv.status,
            type: inv.billing_type,
            issue_date: inv.issue_date.toISOString().slice(0, 10),
            due_date: inv.due_date ? inv.due_date.toISOString().slice(0, 10) : null,
            paid_at: inv.paid_at ? inv.paid_at.toISOString() : null,
            subtotal: Number(inv.subtotal),
            tax: inv.tax_amount != null ? Number(inv.tax_amount) : 0,
            total,
            paid,
            balance: round2(total - paid),
            currency: inv.currency,
            has_cae: !!inv.cae,
        };
    });

    return {
        ok: true,
        data: { invoices: input.status ? rows.filter((r) => r.status === input.status) : rows },
    };
}

/** Horas terminadas, facturables, sin facturar y no cubiertas por paquete, por cliente. */
export async function getUnbilledSummary(
    ctx: EntryAccessContext,
    input: { client_id?: string } = {}
): Promise<DomainResult<unknown>> {
    if (!ctx.financials) return fail("forbidden", FINANCIALS_REQUIRED);

    const entries = await prisma.time_entries.findMany({
        where: {
            billable: true,
            is_billed: false,
            consumed_from_package_id: null,
            end_time: { not: null },
            tasks: {
                projects: {
                    clients: { user_id: ctx.ownerId },
                    ...(input.client_id ? { client_id: input.client_id } : {}),
                },
            },
        },
        select: {
            start_time: true,
            duration_neto: true,
            amount: true,
            tasks: {
                select: { projects: { select: { currency: true, clients: { select: { id: true, name: true } } } } },
            },
        },
    });

    const byClient = new Map<
        string,
        { client: { id: string; name: string }; entries: number; minutes: number; oldest: Date; amount_by_currency: Record<string, number> }
    >();
    for (const e of entries) {
        const { clients: client, currency } = e.tasks.projects;
        const row =
            byClient.get(client.id) ??
            { client, entries: 0, minutes: 0, oldest: e.start_time, amount_by_currency: {} };
        row.entries += 1;
        row.minutes += e.duration_neto ?? 0;
        if (e.start_time < row.oldest) row.oldest = e.start_time;
        row.amount_by_currency[currency] = round2((row.amount_by_currency[currency] ?? 0) + Number(e.amount ?? 0));
        byClient.set(client.id, row);
    }

    return {
        ok: true,
        data: {
            clients: [...byClient.values()]
                .sort((a, b) => b.minutes - a.minutes)
                .map((r) => ({
                    client: r.client,
                    entries: r.entries,
                    hours: round2(r.minutes / 60),
                    oldest_entry: arDayKey(r.oldest),
                    amount_by_currency: r.amount_by_currency,
                })),
        },
    };
}

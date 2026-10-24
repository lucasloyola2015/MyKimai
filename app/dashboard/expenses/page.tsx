import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getExpenses, type ExpenseView } from "@/lib/actions/expenses";
import { getClients } from "@/lib/actions/clients";
import { expenseFiltersSchema, type ExpenseFilters as Filters } from "@/lib/validations/expenses";
import { formatExpenseDate, type ExpenseBillingStatus } from "@/lib/utils/expenses";
import { cn } from "@/lib/utils";
import { ExpenseFilters } from "./expense-filters";

export const dynamic = "force-dynamic";

interface Props {
    searchParams: { client?: string; from?: string; to?: string; status?: string };
}

const STATUS_BADGE: Record<ExpenseBillingStatus, { label: string; className: string }> = {
    pending: { label: "Pendiente de facturar", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    invoiced: { label: "Facturado, sin cobrar", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
    paid: { label: "Cobrado", className: "bg-green-500/10 text-green-700 dark:text-green-400" },
    not_billable: { label: "No facturable", className: "bg-muted text-muted-foreground" },
};

const fmtMoney = (amount: number, currency: string) =>
    `${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/** Suma por moneda ("139.990,00 ARS + 50,00 USD"). */
function totalsByCurrency(rows: ExpenseView[]): string {
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount);
    if (totals.size === 0) return "—";
    return Array.from(totals, ([cur, amount]) => fmtMoney(amount, cur)).join(" + ");
}

export default async function ExpensesPage({ searchParams }: Props) {
    const parsed = expenseFiltersSchema.safeParse({
        client_id: searchParams.client || undefined,
        from: searchParams.from || undefined,
        to: searchParams.to || undefined,
        status: searchParams.status || undefined,
    });
    const filters: Filters = parsed.success ? parsed.data : {};

    const [result, clients] = await Promise.all([getExpenses(filters), getClients()]);
    const expenses = result.success ? result.data : [];
    const byStatus = (s: ExpenseBillingStatus) => expenses.filter((e) => e.billing_status === s);

    const summary: { label: string; rows: ExpenseView[]; className?: string }[] = [
        { label: "Total del período", rows: expenses },
        { label: "Pendiente de facturar", rows: byStatus("pending"), className: "text-amber-600" },
        { label: "Facturado, sin cobrar", rows: byStatus("invoiced"), className: "text-blue-600" },
        { label: "Cobrado", rows: byStatus("paid"), className: "text-green-600" },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Gastos</h1>
                <p className="text-muted-foreground">
                    Compras y gastos de los proyectos que se le refacturan a cada cliente. Se cargan
                    desde cada proyecto (botón Gastos) o por la API.
                </p>
            </div>

            <ExpenseFilters
                clients={clients
                    .map((c) => ({ id: c.id, name: c.name }))
                    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))}
                filters={filters}
            />

            {!result.success ? (
                <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">{result.error}</CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {summary.map((s) => (
                            <Card key={s.label}>
                                <CardHeader className="pb-2">
                                    <CardDescription>
                                        {s.label} · {s.rows.length}
                                    </CardDescription>
                                    <CardTitle className={cn("text-lg font-mono tabular-nums", s.className)}>
                                        {totalsByCurrency(s.rows)}
                                    </CardTitle>
                                </CardHeader>
                            </Card>
                        ))}
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            {expenses.length === 0 ? (
                                <p className="py-12 text-center text-sm text-muted-foreground">
                                    No hay gastos con estos filtros.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                                            <tr>
                                                <th className="p-3 text-left font-semibold">Fecha</th>
                                                <th className="p-3 text-left font-semibold">Cliente / Proyecto</th>
                                                <th className="p-3 text-left font-semibold">Descripción</th>
                                                <th className="p-3 text-left font-semibold">Comprobantes</th>
                                                <th className="p-3 text-right font-semibold">Monto</th>
                                                <th className="p-3 text-left font-semibold">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {expenses.map((e) => {
                                                const badge = STATUS_BADGE[e.billing_status];
                                                return (
                                                    <tr key={e.id} className="align-top hover:bg-muted/30">
                                                        <td className="whitespace-nowrap p-3 font-mono text-xs">
                                                            {formatExpenseDate(e.expense_date)}
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="font-medium">{e.client_name}</div>
                                                            <Link
                                                                href={`/dashboard/projects/${e.project_id}/expenses`}
                                                                className="text-xs text-muted-foreground hover:underline"
                                                            >
                                                                {e.project_name}
                                                            </Link>
                                                        </td>
                                                        <td className="p-3">
                                                            <div>{e.description}</div>
                                                            {e.supplier && (
                                                                <div className="text-xs text-muted-foreground">{e.supplier}</div>
                                                            )}
                                                        </td>
                                                        <td className="p-3">
                                                            {e.attachments.length === 0 ? (
                                                                <span className="text-xs text-muted-foreground">—</span>
                                                            ) : (
                                                                <div className="flex flex-col gap-1">
                                                                    {e.attachments.map((a) => (
                                                                        <a
                                                                            key={a.id}
                                                                            href={a.url ?? undefined}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="inline-flex max-w-[180px] items-center gap-1 text-xs hover:underline"
                                                                        >
                                                                            <FileText className="h-3 w-3 shrink-0" />
                                                                            <span className="truncate">{a.file_name}</span>
                                                                        </a>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="whitespace-nowrap p-3 text-right font-mono font-semibold tabular-nums">
                                                            {fmtMoney(e.amount, e.currency)}
                                                        </td>
                                                        <td className="p-3">
                                                            <Badge variant="outline" className={cn("whitespace-nowrap border-0", badge.className)}>
                                                                {badge.label}
                                                            </Badge>
                                                            {e.invoice_id && (
                                                                <Link
                                                                    href={`/dashboard/invoices/${e.invoice_id}`}
                                                                    className="mt-1 block text-xs text-muted-foreground hover:underline"
                                                                >
                                                                    {e.invoice_number}
                                                                </Link>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}

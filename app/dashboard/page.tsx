import { Clock, FolderKanban, FileText, DollarSign } from "lucide-react";
import { HoursChart } from "@/components/dashboard/hours-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { getDashboardStats } from "@/lib/actions/stats";
import { formatDurationMinutes } from "@/lib/utils/duration";

export const dynamic = "force-dynamic";

function formatRevenue(total: number, currency: string): string {
  return `${currency} ${total.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  // Cuando no hay facturas pagas todavía, mostramos una tarjeta vacía
  // para no romper el grid de 4 columnas.
  const revenueCards =
    stats.revenueByCurrency.length > 0
      ? stats.revenueByCurrency
      : [{ currency: "USD", total: 0, count: 0 }];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Resumen de tu actividad y métricas
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Horas Hoy"
          value={`${formatDurationMinutes(stats.hoursTodayMinutes)}h`}
          subtitle={`${formatDurationMinutes(stats.hoursThisWeekMinutes)}h esta semana`}
          icon={Clock}
        />
        <StatCard
          title="Proyectos Activos"
          value={stats.activeProjects}
          subtitle={`${stats.totalClients} clientes totales`}
          icon={FolderKanban}
        />
        <StatCard
          title="Facturas Pendientes"
          value={stats.pendingInvoices}
          subtitle="Requieren atención"
          icon={FileText}
        />
        {/*
          Ingresos: una tarjeta por moneda (USD, ARS, etc.).
          Fix §3.2 — no se suma USD con ARS en un mismo total.
          Si hay solo 1 moneda, ocupa la última celda como antes.
          Si hay 2+, las restantes pasan a una segunda fila debajo.
        */}
        {revenueCards.map((rev) => (
          <StatCard
            key={rev.currency}
            title={`Ingresos ${rev.currency}`}
            value={formatRevenue(rev.total, rev.currency)}
            subtitle={
              rev.count === 0
                ? "Sin facturas pagadas"
                : `${rev.count} ${rev.count === 1 ? "factura pagada" : "facturas pagadas"}`
            }
            icon={DollarSign}
          />
        ))}
      </div>
      <HoursChart />
    </div>
  );
}

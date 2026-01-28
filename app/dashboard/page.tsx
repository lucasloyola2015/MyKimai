"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";
import { Clock, FolderKanban, FileText, DollarSign } from "lucide-react";
import type { Database } from "@/lib/types/database";
import { HoursChart } from "@/components/dashboard/hours-chart";
import { StatCard } from "@/components/dashboard/stat-card";

type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

export default function DashboardPage() {
  const [stats, setStats] = useState({
    hoursToday: 0, // minutos
    hoursThisWeek: 0, // minutos
    activeProjects: 0,
    totalClients: 0,
    pendingInvoices: 0,
    totalRevenue: 0,
  });

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, "0")}`;
  };
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const today = new Date();
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);
      const weekStart = startOfWeek(today);
      const weekEnd = endOfWeek(today);

      // Hours today
      const { data: todayEntries } = await supabase
        .from("time_entries")
        .select("duration_minutes")
        .eq("user_id", user.id)
        .gte("start_time", todayStart.toISOString())
        .lte("start_time", todayEnd.toISOString());

      const minutesToday =
        todayEntries?.reduce(
          (sum, e) => sum + (e.duration_minutes || 0),
          0
        ) || 0;

      // Hours this week
      const { data: weekEntries } = await supabase
        .from("time_entries")
        .select("duration_minutes")
        .eq("user_id", user.id)
        .gte("start_time", weekStart.toISOString())
        .lte("start_time", weekEnd.toISOString());

      const minutesThisWeek =
        weekEntries?.reduce(
          (sum, e) => sum + (e.duration_minutes || 0),
          0
        ) || 0;

      // Active projects
      const { count: activeProjectsCount } = await supabase
        .from("projects")
        .select("*, clients!inner(user_id)", { count: "exact", head: true })
        .eq("clients.user_id", user.id)
        .eq("status", "active");

      // Total clients
      const { count: clientsCount } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Pending invoices
      const { count: invoicesCount } = await supabase
        .from("invoices")
        .select("*, clients!inner(user_id)", { count: "exact", head: true })
        .eq("clients.user_id", user.id)
        .in("status", ["draft", "sent"]);

      // Total revenue (paid invoices)
      const { data: paidInvoices } = await supabase
        .from("invoices")
        .select("total_amount, currency")
        .eq("status", "paid");

      const totalRevenue = paidInvoices?.reduce(
        (sum, inv) => sum + inv.total_amount,
        0
      ) || 0;

      setStats({
        hoursToday: minutesToday,
        hoursThisWeek: minutesThisWeek,
        activeProjects: activeProjectsCount || 0,
        totalClients: clientsCount || 0,
        pendingInvoices: invoicesCount || 0,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Resumen de tu actividad y métricas
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="" value="" loading />
          <StatCard title="" value="" loading />
          <StatCard title="" value="" loading />
          <StatCard title="" value="" loading />
        </div>
      </div>
    );
  }

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
          value={`${formatTime(stats.hoursToday)}h`}
          subtitle={`${formatTime(stats.hoursThisWeek)}h esta semana`}
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
        <StatCard
          title="Ingresos Totales"
          value={stats.totalRevenue.toFixed(2)}
          subtitle="Facturas pagadas"
          icon={DollarSign}
        />
      </div>
      <HoursChart />
    </div>
  );
}

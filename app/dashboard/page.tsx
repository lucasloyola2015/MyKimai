"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";
import type { Database } from "@/lib/types/database";
import { HoursChart } from "@/components/dashboard/hours-chart";

type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

export default function DashboardPage() {
  const [stats, setStats] = useState({
    hoursToday: 0,
    hoursThisWeek: 0,
    activeProjects: 0,
    totalClients: 0,
    pendingInvoices: 0,
    totalRevenue: 0,
  });
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

      const hoursToday =
        (todayEntries?.reduce(
          (sum, e) => sum + (e.duration_minutes || 0),
          0
        ) || 0) / 60;

      // Hours this week
      const { data: weekEntries } = await supabase
        .from("time_entries")
        .select("duration_minutes")
        .eq("user_id", user.id)
        .gte("start_time", weekStart.toISOString())
        .lte("start_time", weekEnd.toISOString());

      const hoursThisWeek =
        (weekEntries?.reduce(
          (sum, e) => sum + (e.duration_minutes || 0),
          0
        ) || 0) / 60;

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
        hoursToday: Math.round(hoursToday * 100) / 100,
        hoursThisWeek: Math.round(hoursThisWeek * 100) / 100,
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
    return <div>Cargando...</div>;
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Horas Hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.hoursToday}h</div>
            <p className="text-xs text-muted-foreground">
              {stats.hoursThisWeek}h esta semana
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Proyectos Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeProjects}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalClients} clientes totales
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Facturas Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingInvoices}</div>
            <p className="text-xs text-muted-foreground">
              Requieren atención
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalRevenue.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Facturas pagadas
            </p>
          </CardContent>
        </Card>
      </div>
      <HoursChart />
    </div>
  );
}

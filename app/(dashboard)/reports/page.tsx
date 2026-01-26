"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import type { Database } from "@/lib/types/database";
import { format } from "date-fns";

type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

export default function ReportsPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [clients, setClients] = useState<
    Database["public"]["Tables"]["clients"]["Row"][]
  >([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClientComponentClient();

  const [filters, setFilters] = useState({
    client_id: "",
    start_date: "",
    end_date: "",
  });

  useEffect(() => {
    loadClients();
    loadEntries();
  }, []);

  const loadClients = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("name");

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error loading clients:", error);
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      let query = supabase
        .from("time_entries")
        .select("*, tasks(name, projects(name, clients(name, id)))")
        .eq("user_id", user.id)
        .order("start_time", { ascending: false });

      if (filters.start_date) {
        query = query.gte("start_time", `${filters.start_date}T00:00:00`);
      }

      if (filters.end_date) {
        query = query.lte("start_time", `${filters.end_date}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;

      let filteredData = (data || []) as any[];

      if (filters.client_id) {
        filteredData = filteredData.filter((entry: any) => {
          return entry.tasks?.projects?.clients?.id === filters.client_id;
        });
      }

      setEntries(filteredData as any);
    } catch (error) {
      console.error("Error loading entries:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      "Fecha",
      "Cliente",
      "Proyecto",
      "Tarea",
      "Descripción",
      "Duración (min)",
      "Duración (h)",
      "Tarifa",
      "Monto",
    ];

    const rows = entries.map((entry: any) => {
      const task = entry.tasks;
      const project = task?.projects;
      const client = project?.clients;

      return [
        format(new Date(entry.start_time), "dd/MM/yyyy HH:mm"),
        client?.name || "",
        project?.name || "",
        task?.name || "",
        entry.description || "",
        entry.duration_minutes || 0,
        ((entry.duration_minutes || 0) / 60).toFixed(2),
        entry.rate_applied || 0,
        entry.amount || 0,
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `reporte-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reportes</h1>
          <p className="text-muted-foreground">
            Genera reportes y exporta datos de períodos de trabajo
          </p>
        </div>
        <Button onClick={handleExportCSV} disabled={entries.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="client">Cliente</Label>
              <Select
                value={filters.client_id}
                onValueChange={(value) =>
                  setFilters({ ...filters, client_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los clientes</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="start_date">Fecha Inicio</Label>
              <Input
                id="start_date"
                type="date"
                value={filters.start_date}
                onChange={(e) =>
                  setFilters({ ...filters, start_date: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end_date">Fecha Fin</Label>
              <Input
                id="end_date"
                type="date"
                value={filters.end_date}
                onChange={(e) =>
                  setFilters({ ...filters, end_date: e.target.value })
                }
              />
            </div>
          </div>
          <Button onClick={loadEntries} className="mt-4" disabled={loading}>
            {loading ? "Cargando..." : "Aplicar Filtros"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Períodos de Trabajo ({entries.length} resultados)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {entries.map((entry: any) => {
              const task = entry.tasks;
              const project = task?.projects;
              const client = project?.clients;

              return (
                <div
                  key={entry.id}
                  className="rounded-lg border p-4 text-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium">
                        {task?.name || "Tarea eliminada"}
                      </p>
                      <p className="text-muted-foreground">
                        {client?.name} - {project?.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {(entry.duration_minutes || 0) / 60}h
                      </p>
                      {entry.amount && (
                        <p className="text-muted-foreground">
                          {entry.amount.toFixed(2)} {project?.currency || ""}
                        </p>
                      )}
                    </div>
                  </div>
                  {entry.description && (
                    <p className="text-muted-foreground">{entry.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {format(new Date(entry.start_time), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
              );
            })}
          </div>

          {entries.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No hay períodos de trabajo que coincidan con los filtros.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

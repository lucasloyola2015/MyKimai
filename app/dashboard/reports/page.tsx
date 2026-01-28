"use client";

import { useEffect, useState } from "react";
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
import { format } from "date-fns";
import { getClients } from "@/lib/actions/clients";
import { getTimeEntries } from "@/lib/actions/time-entries";
import type { clients, time_entries } from "@/lib/generated/prisma";
import { toast } from "@/hooks/use-toast";

export default function ReportsPage() {
  const [entries, setEntries] = useState<time_entries[]>([]);
  const [clients, setClients] = useState<clients[]>([]);
  const [loading, setLoading] = useState(false);

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
      const data = await getClients();
      setClients(data);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los clientes.",
        variant: "destructive",
      });
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    try {
      const startDate = filters.start_date
        ? new Date(`${filters.start_date}T00:00:00`)
        : undefined;
      const endDate = filters.end_date
        ? new Date(`${filters.end_date}T23:59:59`)
        : undefined;

      const data = await getTimeEntries({
        clientId: filters.client_id || undefined,
        startDate,
        endDate,
      });

      setEntries(data);
    } catch (error) {
      console.error("Error loading entries:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las entradas.",
        variant: "destructive",
      });
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

    const rows = entries.map((entry) => {
      const task = (entry as any).task;
      const project = task?.project;
      const client = project?.client;

      return [
        format(new Date(entry.start_time), "dd/MM/yyyy HH:mm"),
        client?.name || "",
        project?.name || "",
        task?.name || "",
        entry.description || "",
        entry.duration_minutes || 0,
        ((entry.duration_minutes || 0) / 60).toFixed(2),
        Number(entry.rate_applied || 0),
        Number(entry.amount || 0),
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
                value={filters.client_id || "all"}
                onValueChange={(value) =>
                  setFilters({ ...filters, client_id: value === "all" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los clientes</SelectItem>
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
            {entries.map((entry) => {
              const task = (entry as any).task;
              const project = task?.project;
              const client = project?.client;

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
                          {Number(entry.amount).toFixed(2)} {project?.currency || ""}
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

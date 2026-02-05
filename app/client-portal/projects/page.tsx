"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ChevronRight } from "lucide-react";
import { getPortalProjects } from "@/lib/actions/projects";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatDateTime24Short } from "@/lib/date-format";

export default function ClientProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await getPortalProjects();
      setProjects(data || []);
    } catch (err) {
      console.error("Error loading projects:", err);
      setError("No se pudieron cargar tus proyectos. Por favor, intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-end gap-4">
          <div>
            <Skeleton className="h-8 w-48 mb-1" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Proyecto</th>
                <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Horas</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Último registro</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Estado</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Facturación</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td className="py-2 px-3"><Skeleton className="h-4 w-32" /></td>
                  <td className="py-2 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                  <td className="py-2 px-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="py-2 px-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  <td className="py-2 px-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                  <td className="py-2 px-3" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-xl font-bold">Error de vinculación</h2>
        <p className="text-muted-foreground text-sm mt-1 max-w-md">{error}</p>
        <Button onClick={loadProjects} variant="outline" size="sm" className="mt-4">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proyectos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Estado y horas netas por proyecto. Montos solo en Facturación.
          </p>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto -mx-px" style={{ WebkitOverflowScrolling: "touch" }}>
        <table className="w-full text-sm min-w-[580px]">
          <thead>
            <tr className="bg-muted/40 border-b text-muted-foreground">
              <th className="text-left py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Proyecto</th>
              <th className="text-right py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Horas netas</th>
              <th className="text-left py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Último registro</th>
              <th className="text-left py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Estado</th>
              <th className="text-left py-2 px-3 font-semibold uppercase tracking-widest text-[10px]">Facturación</th>
              <th className="w-8 py-2 px-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((project) => (
              <tr key={project.id} className="hover:bg-muted/20 transition-colors group">
                <td className="py-2 px-3">
                  <Link
                    href={`/client-portal/projects/${project.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline underline-offset-2"
                  >
                    {project.name}
                  </Link>
                  {project.description && (
                    <p className="text-[11px] text-muted-foreground truncate max-w-[200px] mt-0.5" title={project.description}>
                      {project.description}
                    </p>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground">
                  {project.total_hours.toFixed(2)}h
                </td>
                <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {project.last_entry_date
                    ? formatDateTime24Short(new Date(project.last_entry_date))
                    : "—"}
                </td>
                <td className="py-2 px-3">
                  <Badge
                    size="sm"
                    variant={project.status === "active" ? "active" : "outline"}
                    className="font-mono text-[10px] uppercase"
                  >
                    {project.status === "active" ? "En curso" : project.status}
                  </Badge>
                </td>
                <td className="py-2 px-3">
                  <Badge
                    size="sm"
                    variant={project.billing_status === "invoiced" ? "completed" : project.billing_status === "pending" ? "warning" : "outline"}
                    className="font-mono text-[10px] uppercase"
                  >
                    {project.billing_status === "invoiced" ? "Facturado" : project.billing_status === "pending" ? "Pendiente" : "Sin registros"}
                  </Badge>
                </td>
                <td className="py-2 px-3">
                  <Link
                    href={`/client-portal/projects/${project.id}`}
                    className="inline-flex text-muted-foreground hover:text-primary transition-colors"
                    aria-label={`Ver ${project.name}`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {projects.length === 0 && (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-sm font-medium">No hay proyectos asignados</p>
          <p className="text-muted-foreground text-xs mt-1">
            Si crees que esto es un error, contacta al administrador.
          </p>
        </div>
      )}
    </div>
  );
}

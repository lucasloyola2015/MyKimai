"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, Clock, CircleDollarSign, AlertCircle } from "lucide-react";
import { getPortalProjects } from "@/lib/actions/projects";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-3/4" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <div className="space-y-2">
                  <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-12" /></div>
                  <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-16" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold">Error de vinculación</h2>
        <p className="text-muted-foreground mt-2 max-w-md">{error}</p>
        <Button onClick={loadProjects} variant="outline" className="mt-6">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mis Proyectos</h1>
        <p className="text-muted-foreground">
          Visualiza el estado de tus proyectos y horas trabajadas
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Link key={project.id} href={`/client-portal/projects/${project.id}`}>
            <Card className="group cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-primary/10 h-full">
              <CardHeader className="bg-primary/5 py-4 border-b">
                <CardTitle className="flex items-center gap-2 group-hover:text-primary transition-colors">
                  <FolderKanban className="h-5 w-5 opacity-70" />
                  {project.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {project.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 italic">
                    "{project.description}"
                  </p>
                )}

                <div className="grid gap-3 pt-2">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/40">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Horas totales</span>
                    </div>
                    <span className="font-mono font-bold text-lg">
                      {project.total_hours.toFixed(2)}h
                    </span>
                  </div>

                  <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CircleDollarSign className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Inversión</span>
                    </div>
                    <span className="font-mono font-bold text-lg text-emerald-700">
                      {project.currency} {Number(project.total_amount).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Estado</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${project.status === 'active'
                    ? 'bg-blue-500/10 text-blue-600 border-blue-200'
                    : 'bg-muted text-muted-foreground border-border'
                    }`}>
                    {project.status === 'active' ? 'En curso' : project.status}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed rounded-xl">
          <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h2 className="text-xl font-semibold">No hay proyectos asignados</h2>
          <p className="text-muted-foreground mt-1">
            Si crees que esto es un error, por favor contacta al administrador.
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/lib/types/database";
import { format } from "date-fns";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

interface ProjectWithHours extends Project {
  total_hours: number;
  total_amount: number;
}

export default function ClientProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithHours[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Get client user relationship
      const { data: clientUser } = await supabase
        .from("client_users")
        .select("client_id")
        .eq("user_id", user.id)
        .single();

      if (!clientUser) {
        setLoading(false);
        return;
      }

      // Get projects for this client
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("*")
        .eq("client_id", clientUser.client_id)
        .order("created_at", { ascending: false });

      if (projectsError) throw projectsError;

      // Get time entries for each project
      const projectsWithHours = await Promise.all(
        (projectsData || []).map(async (project) => {
          // Get tasks for this project
          const { data: tasks } = await supabase
            .from("tasks")
            .select("id")
            .eq("project_id", project.id);

          const taskIds = (tasks || []).map((t) => t.id);

          // Get time entries for these tasks
          const { data: entries } = await supabase
            .from("time_entries")
            .select("duration_minutes, amount")
            .in("task_id", taskIds);

          const totalMinutes =
            entries?.reduce(
              (sum, e) => sum + (e.duration_minutes || 0),
              0
            ) || 0;
          const totalAmount =
            entries?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

          return {
            ...project,
            total_hours: totalMinutes / 60,
            total_amount: totalAmount,
          };
        })
      );

      setProjects(projectsWithHours);
    } catch (error) {
      console.error("Error loading projects:", error);
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
        <h1 className="text-3xl font-bold">Mis Proyectos</h1>
        <p className="text-muted-foreground">
          Visualiza el estado de tus proyectos y horas trabajadas
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle>{project.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {project.description && (
                  <p className="text-muted-foreground">{project.description}</p>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Horas trabajadas:</span>
                  <span className="font-medium">
                    {project.total_hours.toFixed(2)}h
                  </span>
                </div>
                {project.total_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto:</span>
                    <span className="font-medium">
                      {project.total_amount.toFixed(2)} {project.currency}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado:</span>
                  <span className="font-medium">{project.status}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No tienes proyectos asignados.
          </p>
        </div>
      )}
    </div>
  );
}

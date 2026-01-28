"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  CheckSquare,
  Clock,
  FileText,
  Package,
  BarChart3,
  Square,
  Calendar,
  Play,
  Menu,
  X,
} from "lucide-react";
import { UserMenu } from "@/components/user/user-menu";
import { useActiveTimeEntry } from "@/contexts/active-time-entry-context";
import { createClientComponentClient } from "@/lib/supabase/client";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/clients", label: "Clientes", icon: Users },
  { href: "/dashboard/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/dashboard/tasks", label: "Tareas", icon: CheckSquare },
  { href: "/dashboard/time-tracker", label: "Time Tracker", icon: Clock },
  { href: "/dashboard/my-hours", label: "Mis Horas", icon: Calendar },
  { href: "/dashboard/hour-packages", label: "Paquetes", icon: Package },
  { href: "/dashboard/invoices", label: "Facturas", icon: FileText },
  { href: "/dashboard/reports", label: "Reportes", icon: BarChart3 },
];

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeEntry, stopActiveEntry, isLoading } = useActiveTimeEntry();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastEntry, setLastEntry] = useState<{
    client_id: string;
    project_id: string;
    task_id: string;
  } | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadLastEntry = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        // Buscar la última entrada completada
        const { data } = await supabase
          .from("time_entries")
          .select("*, tasks(id, projects(id, clients(id)))")
          .eq("user_id", user.id)
          .not("end_time", "is", null)
          .order("end_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data && (data as any).tasks) {
          const task = (data as any).tasks;
          const project = task.projects;
          const client = project?.clients;

          if (client && project && task) {
            setLastEntry({
              client_id: client.id,
              project_id: project.id,
              task_id: task.id,
            });
          }
        }
      } catch (error) {
        console.error("Error loading last entry:", error);
      }
    };

    loadLastEntry();
  }, []);

  const handleStop = async () => {
    if (confirm("¿Deseas detener la tarea actual?")) {
      await stopActiveEntry();
    }
  };

  const handleStart = () => {
    if (!lastEntry) {
      alert("No hay una entrada previa para continuar. Por favor, selecciona manualmente en Time Tracker.");
      router.push("/dashboard/time-tracker");
      return;
    }

    // Navegar con query parameters
    const params = new URLSearchParams({
      client_id: lastEntry.client_id,
      project_id: lastEntry.project_id,
      task_id: lastEntry.task_id,
    });
    router.push(`/dashboard/time-tracker?${params.toString()}`);
  };

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <nav className="border-b bg-card sticky top-0 z-50">
      <div className="container mx-auto px-4">
        {/* Desktop & Mobile Header */}
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Mobile Menu Button */}
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xl font-bold">
              Time Manager
            </Link>

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden touch-target"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden lg:inline">{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </div>

          {/* Action Buttons & User Menu */}
          <div className="flex items-center gap-2">
            {!isLoading && !activeEntry && lastEntry && (
              <Button
                variant="default"
                size="sm"
                onClick={handleStart}
                className="touch-target flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">Comenzar</span>
              </Button>
            )}
            {!isLoading && activeEntry && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                className="touch-target flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                <span className="hidden sm:inline">Detener</span>
              </Button>
            )}
            <UserMenu />
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t py-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start touch-target",
                      isActive && "bg-secondary"
                    )}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}

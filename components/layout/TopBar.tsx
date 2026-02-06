"use client";

import { useRouter } from "next/navigation";
import { useActiveTimeEntry } from "@/contexts/active-time-entry-context";
import { UserMenu } from "@/components/user/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Square, Play, Pause, Menu } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/shared/hooks/useSidebar";
import { getLastCompletedEntry } from "@/lib/actions/time-entries";

export function TopBar() {
  const router = useRouter();
  const { activeEntry, stopActiveEntry, pauseActiveEntry, resumeActiveEntry, isLoading } = useActiveTimeEntry();
  const { isCollapsed, toggle } = useSidebar();
  const [isStopping, setIsStopping] = useState(false);
  const [isPausing, setIsPausing] = useState(false);

  // Determinar si hay una pausa activa
  const activeBreak = activeEntry?.breaks?.find(b => b.end_time === null);
  const isPaused = !!activeBreak;

  const handleStop = async () => {
    if (!activeEntry) return;

    setIsStopping(true);
    try {
      await stopActiveEntry();
      toast({
        title: "Tarea finalizada",
        description: "El tiempo neto de trabajo ha sido guardado.",
      });
    } catch (error) {
      console.error("Error stopping entry:", error);
    } finally {
      setIsStopping(false);
    }
  };

  const handlePauseToggle = async () => {
    if (!activeEntry) return;

    setIsPausing(true);
    try {
      if (isPaused) {
        await resumeActiveEntry();
        toast({
          title: "Trabajo reanudado",
          description: "El contador vuelve a estar activo.",
        });
      } else {
        await pauseActiveEntry();
        toast({
          title: "Trabajo pausado",
          description: "La pausa ha sido registrada exitosamente.",
        });
      }
    } catch (error) {
      console.error("Error toggling pause:", error);
    } finally {
      setIsPausing(false);
    }
  };

  const handleStart = async () => {
    try {
      // Obtener la última entrada completada usando Server Action
      const lastEntry = await getLastCompletedEntry();

      if (lastEntry && lastEntry.task) {
        const clientId = lastEntry.task.project?.client?.id;
        const projectId = lastEntry.task.project_id;
        const taskId = lastEntry.task_id;

        // Redirigir al Time Tracker con los datos precargados
        router.push(
          `/dashboard/time-tracker?client_id=${clientId}&project_id=${projectId}&task_id=${taskId}`
        );
      } else {
        // Si no hay última entrada, redirigir sin parámetros
        router.push("/dashboard/time-tracker");
      }
    } catch (error) {
      console.error("Error loading last entry:", error);
      // Redirigir de todas formas al Time Tracker
      router.push("/dashboard/time-tracker");
    }
  };

  // Obtener nombre de la tarea activa
  const getTaskName = () => {
    if (!activeEntry?.tasks) return "Tarea activa";
    const task = activeEntry.tasks;
    const project = task.projects;
    const client = project?.clients;

    if (client?.name && project?.name && task.name) {
      return `${client.name} → ${project.name} → ${task.name}`;
    }
    return task.name || "Tarea activa";
  };

  // Calcular tiempo transcurrido
  const getElapsedTime = () => {
    if (!activeEntry?.start_time) return "";
    const startTime = new Date(activeEntry.start_time);
    return formatDistanceToNow(startTime, {
      addSuffix: false,
      locale: es,
    });
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "h-14 flex items-center justify-between px-4 md:px-6",
        "px-4 md:px-6",
        // En desktop: el layout flex ya maneja el espacio del sidebar (no necesita margen)
        "w-full"
      )}
    >
      {/* Botón menú lateral (solo móvil) */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden shrink-0 h-9 w-9 min-h-[44px] min-w-[44px] -ml-2"
        onClick={toggle}
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Botón de acción dinámica (centro/izquierda) */}
      <div className="flex-1 flex items-center gap-2 md:gap-3 min-w-0">
        {activeEntry ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStop}
              disabled={isStopping || isPausing || isLoading}
              className="flex items-center gap-1.5 h-8 text-xs md:text-sm font-bold"
            >
              <Square className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">FINALIZAR</span>
              <span className="sm:hidden">FIN</span>
            </Button>

            <Button
              variant={isPaused ? "default" : "secondary"}
              size="sm"
              onClick={handlePauseToggle}
              disabled={isStopping || isPausing || isLoading}
              className={cn(
                "flex items-center gap-1.5 h-8 text-xs md:text-sm transition-all duration-300",
                isPaused
                  ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                  : "bg-muted hover:bg-muted/80"
              )}
            >
              {isPaused ? (
                <>
                  <Play className="h-3.5 w-3.5 animate-pulse" />
                  <span className="hidden sm:inline font-bold">REANUDAR</span>
                  <span className="sm:hidden">PLAY</span>
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 text-amber-500" />
                  <span className="hidden sm:inline font-medium">PAUSAR</span>
                  <span className="sm:hidden">PAUSE</span>
                </>
              )}
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={handleStart}
            disabled={isLoading}
            className="flex items-center gap-1.5 md:gap-2 shrink-0 h-8 text-xs md:text-sm font-bold"
          >
            <Play className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden sm:inline">INICIAR</span>
            <span className="sm:hidden">START</span>
          </Button>
        )}

        {/* Información de la tarea activa */}
        {activeEntry && (
          <div className={cn(
            "flex-1 min-w-0 flex items-center gap-1.5 md:gap-2 text-xs md:text-sm transition-colors duration-300",
            isPaused ? "text-amber-500/80 font-medium italic" : "text-muted-foreground"
          )}>
            <span className="truncate hidden lg:inline">{getTaskName()}</span>
            <span className="truncate hidden md:inline lg:hidden max-w-[200px] font-mono">{getTaskName()}</span>
            <span className="text-xs hidden sm:inline">•</span>
            <span className={cn(
              "text-xs whitespace-nowrap font-mono",
              isPaused && "animate-pulse"
            )}>
              {isPaused ? "EN PAUSA" : getElapsedTime()}
            </span>
          </div>
        )}
      </div>

      {/* Tema y menú de usuario (derecha) */}
      <div className="flex items-center gap-1 shrink-0">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

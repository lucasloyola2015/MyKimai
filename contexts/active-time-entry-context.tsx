"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  getActiveTimeEntries,
  pauseTimeEntry,
  resumeTimeEntry,
  stopTimeEntry,
} from "@/lib/actions/time-entries";

/**
 * §parallel-timers — el contexto ahora trackea TODAS las entradas activas
 * (timers en paralelo). `activeEntry` se mantiene como la más reciente para
 * compatibilidad con el TopBar; `activeEntries` es la lista completa que consume
 * el panel de "Tareas activas".
 */
export interface ActiveTimeEntry {
  id: string;
  task_id: string;
  start_time: string | Date;
  end_time: string | Date | null;
  description: string | null;
  tasks?: {
    name: string;
    project_id?: string;
    projects?: {
      id?: string;
      name: string;
      currency?: string;
      clients?: { id?: string; name: string };
    };
  };
  breaks?: Array<{
    id: string;
    start_time: string | Date;
    end_time: string | Date | null;
  }>;
  [key: string]: any;
}

interface ActiveTimeEntryContextType {
  /** Entrada activa más reciente (compat TopBar). */
  activeEntry: ActiveTimeEntry | null;
  /** Todas las entradas activas (timers en paralelo). */
  activeEntries: ActiveTimeEntry[];
  isLoading: boolean;
  refreshActiveEntry: () => Promise<void>;
  /** Detiene una entrada; si no se pasa id, usa la más reciente. */
  stopActiveEntry: (id?: string) => Promise<void>;
  pauseActiveEntry: (id?: string) => Promise<void>;
  resumeActiveEntry: (id?: string) => Promise<void>;
}

const ActiveTimeEntryContext = createContext<ActiveTimeEntryContextType | undefined>(undefined);

function mapEntry(e: any): ActiveTimeEntry {
  return { ...e, breaks: e.time_entry_breaks ?? e.breaks ?? [] };
}

export function ActiveTimeEntryProvider({ children }: { children: ReactNode }) {
  const [activeEntries, setActiveEntries] = useState<ActiveTimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // La más reciente (última iniciada) para el control rápido del TopBar.
  const activeEntry = activeEntries.length > 0 ? activeEntries[activeEntries.length - 1] : null;

  const refreshActiveEntry = async () => {
    try {
      const data = await getActiveTimeEntries();
      setActiveEntries((data ?? []).map(mapEntry));
    } catch (error) {
      console.error("Error in refreshActiveEntry:", error);
      setActiveEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const stopActiveEntry = async (id?: string) => {
    const target = id ?? activeEntry?.id;
    if (!target) return;
    const result = await stopTimeEntry(target);
    if (!result.success) throw new Error(result.error);
    await refreshActiveEntry();
  };

  const pauseActiveEntry = async (id?: string) => {
    const target = id ?? activeEntry?.id;
    if (!target) return;
    const result = await pauseTimeEntry(target);
    if (!result.success) throw new Error(result.error);
    await refreshActiveEntry();
  };

  const resumeActiveEntry = async (id?: string) => {
    const target = id ?? activeEntry?.id;
    if (!target) return;
    const result = await resumeTimeEntry(target);
    if (!result.success) throw new Error(result.error);
    await refreshActiveEntry();
  };

  useEffect(() => {
    refreshActiveEntry();
    // Refrescar cada 30 segundos para mantener sincronizado entre pestañas/dispositivos.
    const interval = setInterval(refreshActiveEntry, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ActiveTimeEntryContext.Provider
      value={{
        activeEntry,
        activeEntries,
        isLoading,
        refreshActiveEntry,
        stopActiveEntry,
        pauseActiveEntry,
        resumeActiveEntry,
      }}
    >
      {children}
    </ActiveTimeEntryContext.Provider>
  );
}

export function useActiveTimeEntry() {
  const context = useContext(ActiveTimeEntryContext);
  if (context === undefined) {
    throw new Error("useActiveTimeEntry must be used within an ActiveTimeEntryProvider");
  }
  return context;
}

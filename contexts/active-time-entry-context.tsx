"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
import { pauseTimeEntry, resumeTimeEntry, stopTimeEntry } from "@/lib/actions/time-entries";
import type { Database } from "@/lib/types/database";

type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

interface ActiveTimeEntry extends TimeEntry {
  tasks?: {
    name: string;
    projects?: {
      name: string;
      clients?: {
        name: string;
      };
    };
  };
  breaks?: Array<{
    id: string;
    start_time: string;
    end_time: string | null;
  }>;
}

interface ActiveTimeEntryContextType {
  activeEntry: ActiveTimeEntry | null;
  isLoading: boolean;
  refreshActiveEntry: () => Promise<void>;
  stopActiveEntry: () => Promise<void>;
  pauseActiveEntry: () => Promise<void>;
  resumeActiveEntry: () => Promise<void>;
}

const ActiveTimeEntryContext = createContext<ActiveTimeEntryContextType | undefined>(undefined);

export function ActiveTimeEntryProvider({ children }: { children: ReactNode }) {
  const [activeEntry, setActiveEntry] = useState<ActiveTimeEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClientComponentClient();

  const refreshActiveEntry = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setActiveEntry(null);
        setIsLoading(false);
        return;
      }

      // Buscar entrada activa (con start_time pero sin end_time)
      const { data, error } = await supabase
        .from("time_entries")
        .select("*, tasks(name, projects(name, clients(name))), breaks:time_entry_breaks(*)")
        .eq("user_id", user.id)
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error loading active entry:", error);
        setActiveEntry(null);
        return;
      }

      setActiveEntry(data || null);
    } catch (error) {
      console.error("Error in refreshActiveEntry:", error);
      setActiveEntry(null);
    } finally {
      setIsLoading(false);
    }
  };

  const stopActiveEntry = async () => {
    if (!activeEntry) return;

    try {
      const result = await stopTimeEntry(activeEntry.id);
      if (!result.success) throw new Error(result.error);

      // Refrescar la entrada activa (ahora debería ser null)
      await refreshActiveEntry();
    } catch (error) {
      console.error("Error stopping active entry:", error);
      alert(error instanceof Error ? error.message : "Error al detener la tarea");
    }
  };

  const pauseActiveEntry = async () => {
    if (!activeEntry) return;

    try {
      const result = await pauseTimeEntry(activeEntry.id);
      if (!result.success) throw new Error(result.error);

      await refreshActiveEntry();
    } catch (error) {
      console.error("Error pausing active entry:", error);
      alert(error instanceof Error ? error.message : "Error al pausar la tarea");
    }
  };

  const resumeActiveEntry = async () => {
    if (!activeEntry) return;

    try {
      const result = await resumeTimeEntry(activeEntry.id);
      if (!result.success) throw new Error(result.error);

      await refreshActiveEntry();
    } catch (error) {
      console.error("Error resuming active entry:", error);
      alert(error instanceof Error ? error.message : "Error al reanudar la tarea");
    }
  };

  useEffect(() => {
    refreshActiveEntry();

    // Refrescar cada 30 segundos para mantener sincronizado
    const interval = setInterval(refreshActiveEntry, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ActiveTimeEntryContext.Provider
      value={{
        activeEntry,
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

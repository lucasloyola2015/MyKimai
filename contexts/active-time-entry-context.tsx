"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
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
}

interface ActiveTimeEntryContextType {
  activeEntry: ActiveTimeEntry | null;
  isLoading: boolean;
  refreshActiveEntry: () => Promise<void>;
  stopActiveEntry: () => Promise<void>;
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
        .select("*, tasks(name, projects(name, clients(name)))")
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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const endTime = new Date();
      const startTime = new Date(activeEntry.start_time);
      const durationMinutes = Math.floor(
        (endTime.getTime() - startTime.getTime()) / (1000 * 60)
      );

      if (durationMinutes < 1) {
        alert("El tiempo debe ser al menos 1 minuto");
        return;
      }

      // Importar funciones de rate si es necesario
      const { getRateContext } = await import("@/lib/actions/rates");
      const { resolveRate } = await import("@/lib/utils/rates");
      const rateContext = await getRateContext(activeEntry.task_id);
      const rate = resolveRate(rateContext);

      const { error } = await supabase
        .from("time_entries")
        .update({
          end_time: endTime.toISOString(),
          duration_minutes: durationMinutes,
          rate_applied: rate,
          amount: rate ? (durationMinutes / 60) * rate : null,
        })
        .eq("id", activeEntry.id);

      if (error) throw error;

      // Refrescar la entrada activa (ahora debería ser null)
      await refreshActiveEntry();
    } catch (error) {
      console.error("Error stopping active entry:", error);
      alert("Error al detener la tarea");
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

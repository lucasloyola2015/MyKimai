"use client";

import { useState, useEffect } from "react";
import { SidebarState } from "@/shared/types/sidebar.types";

const STORAGE_KEY = "sidebar-state";

export function useSidebar() {
    const [state, setState] = useState<SidebarState>({
        isOpen: false,
        isCollapsed: false,
    });

    // Cargar estado desde localStorage
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                setState(JSON.parse(saved));
            } catch (error) {
                console.error("Error loading sidebar state:", error);
            }
        }
    }, []);

    // Guardar estado en localStorage
    const updateState = (newState: Partial<SidebarState>) => {
        setState((prev) => {
            const updated = { ...prev, ...newState };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    };

    return {
        ...state,
        toggle: () => updateState({ isOpen: !state.isOpen }),
        collapse: () => updateState({ isCollapsed: !state.isCollapsed }),
        close: () => updateState({ isOpen: false }),
    };
}

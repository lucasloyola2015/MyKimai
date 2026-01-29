"use client";

import { useState, useEffect, useCallback } from "react";
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
    const updateState = useCallback((newState: Partial<SidebarState>) => {
        setState((prev) => {
            const updated = { ...prev, ...newState };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const toggle = useCallback(() => {
        setState((prev) => {
            const updated = { ...prev, isOpen: !prev.isOpen };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const collapse = useCallback(() => {
        setState((prev) => {
            const updated = { ...prev, isCollapsed: !prev.isCollapsed };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const close = useCallback(() => {
        setState((prev) => {
            const updated = { ...prev, isOpen: false };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    return {
        ...state,
        toggle,
        collapse,
        close,
    };
}

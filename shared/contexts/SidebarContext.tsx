"use client";

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from "react";
import type { SidebarState } from "@/shared/types/sidebar.types";

const STORAGE_KEY = "sidebar-state";

interface SidebarContextValue extends SidebarState {
    toggle: () => void;
    collapse: () => void;
    close: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SidebarState>({
        isOpen: false,
        isCollapsed: false,
    });

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                setState(JSON.parse(saved));
            } catch {
                // ignore
            }
        }
    }, []);

    const toggle = useCallback(() => {
        setState((prev) => {
            const updated = { ...prev, isOpen: !prev.isOpen };
            if (typeof window !== "undefined") {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            }
            return updated;
        });
    }, []);

    const collapse = useCallback(() => {
        setState((prev) => {
            const updated = { ...prev, isCollapsed: !prev.isCollapsed };
            if (typeof window !== "undefined") {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            }
            return updated;
        });
    }, []);

    const close = useCallback(() => {
        setState((prev) => {
            const updated = { ...prev, isOpen: false };
            if (typeof window !== "undefined") {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            }
            return updated;
        });
    }, []);

    const value: SidebarContextValue = {
        ...state,
        toggle,
        collapse,
        close,
    };

    return (
        <SidebarContext.Provider value={value}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar(): SidebarContextValue {
    const ctx = useContext(SidebarContext);
    if (!ctx) {
        // Fallback cuando se usa fuera del provider (ej. en tests)
        return {
            isOpen: false,
            isCollapsed: false,
            toggle: () => {},
            collapse: () => {},
            close: () => {},
        };
    }
    return ctx;
}

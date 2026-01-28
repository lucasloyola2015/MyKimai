import { LucideIcon } from "lucide-react";

export interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: "activeProjects" | "pendingInvoices";
}

export interface NavStats {
    activeProjects: number;
    pendingInvoices: number;
    activeTimeEntry: boolean;
    todayHours: number;
}

export interface SidebarState {
    isOpen: boolean;      // Móvil: abierto/cerrado
    isCollapsed: boolean; // Desktop: expandido/colapsado
}

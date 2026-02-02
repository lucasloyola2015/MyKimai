"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import {
    LayoutDashboard,
    Users,
    FolderKanban,
    CheckSquare,
    Clock,
    FileText,
    Package,
    BarChart3,
    Calendar,
    Menu,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarToggle } from "./SidebarToggle";
import { useSidebar } from "@/shared/hooks/useSidebar";
import type { NavItem, NavStats } from "@/shared/types/sidebar.types";

const navItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/clients", label: "Clientes", icon: Users },
    {
        href: "/dashboard/projects",
        label: "Proyectos",
        icon: FolderKanban,
        badge: "activeProjects",
    },
    { href: "/dashboard/tasks", label: "Tareas", icon: CheckSquare },
    { href: "/dashboard/time-tracker", label: "Time Tracker", icon: Clock },
    { href: "/dashboard/my-hours", label: "Mis Horas", icon: Calendar },
    { href: "/dashboard/hour-packages", label: "Paquetes", icon: Package },
    {
        href: "/dashboard/invoices",
        label: "Facturas",
        icon: FileText,
        badge: "pendingInvoices",
    },
    { href: "/dashboard/reports", label: "Reportes", icon: BarChart3 },
];

interface AppSidebarProps {
    stats: NavStats;
}

export function AppSidebar({ stats }: AppSidebarProps) {
    const pathname = usePathname();
    const { isOpen, isCollapsed, toggle, collapse, close } = useSidebar();

    // Cerrar sidebar móvil al cambiar de ruta
    useEffect(() => {
        close();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    return (
        <>
            {/* Backdrop para móvil */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden sidebar-backdrop"
                    onClick={close}
                    aria-hidden="true"
                    style={{ pointerEvents: 'auto' }}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50",
                    "w-64 bg-card border-r",
                    "transform transition-transform duration-300 ease-in-out",
                    "flex flex-col",
                    // Mobile: overlay
                    "md:translate-x-0",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                    // Desktop: colapsable
                    "md:relative md:z-auto",
                    isCollapsed && "md:w-16"
                )}
                style={{ zIndex: 50 }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    {!isCollapsed && (
                        <Link href="/dashboard" className="text-lg font-bold">
                            Time Manager
                        </Link>
                    )}
                    {/* Botón cerrar en móvil */}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="md:hidden"
                        onClick={close}
                        aria-label="Cerrar menú"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-3 space-y-1 sidebar-scroll">
                    {navItems
                        .filter(item => {
                            if (stats.role === "CLIENT") {
                                // Ocultar Clientes y Time Tracker para clientes
                                if (item.label === "Clientes" || item.label === "Time Tracker") return false;
                            }
                            return true;
                        })
                        .map((item) => {
                            const isActive = pathname === item.href;
                            const badgeValue = item.badge ? stats[item.badge] : undefined;

                            return (
                                <SidebarNavItem
                                    key={item.href}
                                    href={item.href}
                                    label={item.label}
                                    icon={item.icon}
                                    badge={badgeValue}
                                    isCollapsed={isCollapsed}
                                    isActive={isActive}
                                />
                            );
                        })}

                    {/* Link directo al Portal si es cliente */}
                    {stats.role === "CLIENT" && (
                        <div className="pt-4 mt-4 border-t">
                            <SidebarNavItem
                                href="/client-portal"
                                label="Ir al Portal"
                                icon={LayoutDashboard}
                                isCollapsed={isCollapsed}
                                isActive={pathname === "/client-portal"}
                            />
                        </div>
                    )}
                </nav>

                {/* Footer con toggle */}
                <div className="p-3 border-t">
                    <SidebarToggle isCollapsed={isCollapsed} onToggle={collapse} />
                </div>
            </aside>

            {/* Mobile menu button - Fixed top-left */}
            <Button
                variant="ghost"
                size="sm"
                className={cn(
                    "fixed top-4 left-4 z-30 md:hidden touch-target",
                    "bg-card border shadow-sm"
                )}
                onClick={toggle}
                aria-label="Abrir menú"
            >
                <Menu className="h-5 w-5" />
            </Button>
        </>
    );
}

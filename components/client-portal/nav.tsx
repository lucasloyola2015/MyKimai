"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FolderKanban, FileText, LogOut, LayoutDashboard, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/client-portal", label: "Resumen", icon: LayoutDashboard },
  { href: "/client-portal/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/client-portal/invoices", label: "Facturas", icon: FileText },
];

export function ClientPortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
    setMenuOpen(false);
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-40 border-b bg-card w-full">
      <div className="w-full max-w-full mx-auto flex h-14 min-h-[44px] items-center justify-between px-3 sm:px-4">
        <Link href="/client-portal" className="text-lg font-bold shrink-0">
          Portal
        </Link>

        {/* Desktop: links + switch tema + salir */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="default"
                  className="min-h-[44px] flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Button>
              </Link>
            );
          })}
          <Button variant="ghost" size="default" className="min-h-[44px]" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span className="ml-2">Salir</span>
          </Button>
        </div>

        {/* Mobile: switch tema + hamburger */}
        <div className="flex md:hidden items-center gap-1">
          <ThemeToggle />
          <Button
          variant="ghost"
          size="icon"
          className="md:hidden min-h-[44px] min-w-[44px]"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </Button>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              "fixed inset-y-0 right-0 z-50 w-full max-w-[280px] bg-card border-l shadow-xl",
              "flex flex-col md:hidden animate-in slide-in-from-right duration-200"
            )}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-semibold">Menú</span>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex flex-col p-2">
              <div className="flex items-center justify-between px-2 py-2 border-b mb-2">
                <span className="text-sm text-muted-foreground">Tema</span>
                <ThemeToggle />
              </div>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className="w-full justify-start min-h-[44px] gap-3 text-left"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
              <Button
                variant="ghost"
                className="w-full justify-start min-h-[44px] gap-3 text-left mt-2 border-t pt-2"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span>Salir</span>
              </Button>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

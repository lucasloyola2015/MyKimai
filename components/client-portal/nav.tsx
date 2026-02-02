"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FolderKanban, FileText, LogOut, LayoutDashboard } from "lucide-react";

const navItems = [
  { href: "/client-portal", label: "Resumen", icon: LayoutDashboard },
  { href: "/client-portal/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/client-portal/invoices", label: "Facturas", icon: FileText },
];

export function ClientPortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center space-x-8">
          <Link href="/client-portal" className="text-xl font-bold">
            Portal de Cliente
          </Link>
          <div className="flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className="flex items-center space-x-2"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
        <Button variant="ghost" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Salir
        </Button>
      </div>
    </nav>
  );
}

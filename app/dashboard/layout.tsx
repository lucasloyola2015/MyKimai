import { Suspense } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PageErrorBoundary } from "@/components/layout/PageErrorBoundary";
import { ChildrenDebugWrapper } from "@/components/layout/ChildrenDebugWrapper";
import { ActiveTimeEntryProvider } from "@/contexts/active-time-entry-context";
import { getNavStats } from "@/lib/actions/stats";
import { getClientContext } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import type { NavStats } from "@/shared/types/sidebar.types";

export const dynamic = "force-dynamic";

// Componente para cargar las stats con Suspense
async function SidebarWithStats() {
  try {
    const stats = await getNavStats();
    return <AppSidebar stats={stats} />;
  } catch (error) {
    console.error("Error loading nav stats:", error);
    // Retornar stats por defecto en caso de error
    const defaultStats: NavStats = {
      activeProjects: 0,
      pendingInvoices: 0,
      activeTimeEntry: false,
      todayHours: 0,
    };
    return <AppSidebar stats={defaultStats} />;
  }
}

// Fallback para el sidebar mientras carga
function SidebarFallback() {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="text-lg font-bold">Time Manager</div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="h-10 bg-muted animate-pulse rounded-md" />
        <div className="h-10 bg-muted animate-pulse rounded-md" />
        <div className="h-10 bg-muted animate-pulse rounded-md" />
      </nav>
    </aside>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientContext = await getClientContext();
  if (clientContext) {
    redirect("/client-portal");
  }

  return (
    <ProtectedRoute>
      <ActiveTimeEntryProvider>
        <div className="flex min-h-screen bg-background">
          <Suspense fallback={<SidebarFallback />}>
            <SidebarWithStats />
          </Suspense>
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar />
            <main className="flex-1 p-4 md:p-6 overflow-auto">
              <div className="container mx-auto max-w-7xl">
                <Suspense fallback={<div className="p-4">Cargando página...</div>}>
                  <PageErrorBoundary>
                    <ChildrenDebugWrapper>
                      {children}
                    </ChildrenDebugWrapper>
                  </PageErrorBoundary>
                </Suspense>
              </div>
            </main>
          </div>
        </div>
      </ActiveTimeEntryProvider>
    </ProtectedRoute>
  );
}


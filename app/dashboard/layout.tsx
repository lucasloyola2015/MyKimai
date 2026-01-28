import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ActiveTimeEntryProvider } from "@/contexts/active-time-entry-context";
import { getNavStats } from "@/lib/actions/stats";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const stats = await getNavStats();

  return (
    <ProtectedRoute>
      <ActiveTimeEntryProvider>
        <div className="flex min-h-screen bg-background">
          <AppSidebar stats={stats} />
          <main className="flex-1 p-4 md:p-6">
            <div className="container mx-auto">{children}</div>
          </main>
        </div>
      </ActiveTimeEntryProvider>
    </ProtectedRoute>
  );
}


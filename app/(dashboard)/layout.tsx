import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardNav } from "@/components/dashboard/nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <main className="container mx-auto py-6">{children}</main>
      </div>
    </ProtectedRoute>
  );
}

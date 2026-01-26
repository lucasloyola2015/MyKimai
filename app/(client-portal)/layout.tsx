import { ClientPortalNav } from "@/components/client-portal/nav";
import { ClientProtectedRoute } from "@/components/client-portal/protected-route";

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientProtectedRoute>
      <div className="min-h-screen bg-background">
        <ClientPortalNav />
        <main className="container mx-auto py-6">{children}</main>
      </div>
    </ClientProtectedRoute>
  );
}

import { ClientPortalNav } from "@/components/client-portal/nav";
import { getClientContext } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getClientContext();

  if (!context) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <ClientPortalNav />
      <main className="container mx-auto py-6">{children}</main>
    </div>
  );
}

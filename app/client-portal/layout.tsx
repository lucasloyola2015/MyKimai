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
    <div className="min-h-screen bg-background w-full max-w-full overflow-x-hidden">
      <ClientPortalNav />
      <main className="w-full max-w-full mx-auto px-3 py-4 sm:px-4 md:py-6">{children}</main>
    </div>
  );
}

import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-end border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <ThemeToggle />
      </header>
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        {children}
      </main>
    </div>
  );
}

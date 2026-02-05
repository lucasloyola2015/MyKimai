import Link from "next/link";
import { WifiOff } from "lucide-react";

/**
 * Página minimalista mostrada cuando el usuario pierde conexión.
 * El Service Worker sirve esta vista como fallback para navegaciones offline.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <WifiOff className="h-16 w-16 text-muted-foreground mb-6" aria-hidden />
      <h1 className="text-2xl font-bold text-center mb-2">Sin conexión</h1>
      <p className="text-muted-foreground text-center max-w-sm mb-8">
        No hay conexión a internet. Revisa tu red y vuelve a intentar.
      </p>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 min-h-[44px] inline-flex items-center justify-center"
      >
        Reintentar
      </Link>
    </div>
  );
}

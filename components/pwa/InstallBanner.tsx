"use client";

import { useState, useEffect } from "react";
import { X, Download } from "lucide-react";
import Link from "next/link";

const STORAGE_KEY = "pwa-install-banner-dismissed";

export function InstallBanner() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(ios);

    const dismissed = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
    if (dismissed || standalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if (ios) setShow(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setShow(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  };

  if (!show) return null;

  return (
    <div
      role="banner"
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-3 shadow-lg animate-in slide-in-from-bottom duration-300 md:max-w-sm md:left-4 md:bottom-4 md:rounded-lg md:border"
      aria-label="Instalar aplicación"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Instalar MyKimai</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isIOS ? (
              'Toca Compartir y luego "Añadir a pantalla de inicio".'
            ) : (
              "Usa la app como en tu teléfono, sin barra del navegador."
            )}
          </p>
          <div className="flex gap-2 mt-3">
            {!isIOS && deferredPrompt && (
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 min-h-[44px]"
              >
                <Download className="h-4 w-4" />
                Instalar
              </button>
            )}
            {isIOS && (
              <Link
                href="/offline"
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent min-h-[44px]"
              >
                Cómo instalar
              </Link>
            )}
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-md p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

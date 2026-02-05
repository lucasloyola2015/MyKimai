import type { MetadataRoute } from "next";

/**
 * Web App Manifest para PWA (Progressive Web App).
 * Permite instalación en pantalla de inicio y modo standalone en iOS/Android.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyKimai - Gestión de Tiempos",
    short_name: "MyKimai",
    description: "Sistema de gestión de tiempos y facturación para ingeniería",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    orientation: "portrait-primary",
    scope: "/",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

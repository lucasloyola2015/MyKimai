"use client";

import { useEffect } from "react";

/**
 * Registra el Service Worker en el cliente.
 * Se ejecuta una sola vez por pestaña.
 */
export function RegisterSW() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          reg.update();
        })
        .catch(() => {});
    }
  }, []);
  return null;
}

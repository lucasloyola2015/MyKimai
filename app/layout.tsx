import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { RegisterSW } from "@/components/pwa/RegisterSW";
import { InstallBanner } from "@/components/pwa/InstallBanner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sistema de Gestión de Tiempos",
  description: "Sistema simplificado de gestión de tiempos y facturación",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} transition-colors duration-200`}>
        <ThemeProvider>
          {children}
          <RegisterSW />
          <InstallBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}

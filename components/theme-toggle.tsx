"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/** Switch tipo pill para alternar modo claro/oscuro. Persistencia en localStorage (mykimai-theme). */
export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "h-9 w-14 shrink-0 rounded-full bg-muted",
          className
        )}
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Modo oscuro activo. Clic para modo claro" : "Modo claro activo. Clic para modo oscuro"}
      className={cn(
        "relative h-9 w-14 shrink-0 rounded-full transition-colors duration-200",
        "border border-border bg-muted hover:bg-muted/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span
        className={cn(
          "absolute top-1 flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200",
          isDark
            ? "left-1 bg-primary text-primary-foreground"
            : "left-6 bg-background text-foreground shadow-sm"
        )}
      >
        {isDark ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
      </span>
    </button>
  );
}

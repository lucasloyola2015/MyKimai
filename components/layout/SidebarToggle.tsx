"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarToggleProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

export function SidebarToggle({ isCollapsed, onToggle }: SidebarToggleProps) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn(
                "hidden md:flex items-center gap-2 w-full justify-start px-3",
                isCollapsed && "md:justify-center md:px-2"
            )}
            aria-label={isCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
            {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
            ) : (
                <>
                    <ChevronLeft className="h-4 w-4" />
                    <span className="text-xs text-muted-foreground">Colapsar</span>
                </>
            )}
        </Button>
    );
}

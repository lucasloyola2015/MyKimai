"use client";

import { useRouter } from "next/navigation";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SidebarNavItemProps {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: number | string;
    isCollapsed: boolean;
    isActive: boolean;
}

export function SidebarNavItem({
    href,
    label,
    icon: Icon,
    badge,
    isCollapsed,
    isActive,
}: SidebarNavItemProps) {
    const router = useRouter();

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        router.push(href);
    };

    return (
        <div
            onClick={handleClick}
            className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md",
                "transition-colors duration-200",
                "hover:bg-accent hover:text-accent-foreground",
                "touch-target cursor-pointer",
                "relative z-10",
                isActive && "bg-secondary text-secondary-foreground font-medium",
                isCollapsed && "md:justify-center md:px-2"
            )}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClick(e as any);
                }
            }}
        >
            <Icon className={cn("h-5 w-5 flex-shrink-0")} />
            {!isCollapsed && (
                <>
                    <span className="flex-1 text-sm">{label}</span>
                    {badge !== undefined && badge !== 0 && (
                        <Badge
                            variant={isActive ? "default" : "secondary"}
                            className="text-xs px-1.5 py-0.5 min-w-[20px] justify-center"
                        >
                            {badge}
                        </Badge>
                    )}
                </>
            )}
        </div>
    );
}

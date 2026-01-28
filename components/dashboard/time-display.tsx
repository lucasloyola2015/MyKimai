import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeDisplayProps {
    minutes: number;
    label?: string;
    size?: "sm" | "md" | "lg";
    showIcon?: boolean;
    className?: string;
    realTime?: boolean;
    startTime?: Date;
}

export function TimeDisplay({
    minutes: initialMinutes,
    label,
    size = "md",
    showIcon = false,
    className,
    realTime = false,
    startTime,
}: TimeDisplayProps) {
    const [minutes, setMinutes] = useState(initialMinutes);

    useEffect(() => {
        if (!realTime || !startTime) {
            setMinutes(initialMinutes);
            return;
        }

        const interval = setInterval(() => {
            const now = new Date();
            const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000 / 60);
            setMinutes(diff);
        }, 1000);

        return () => clearInterval(interval);
    }, [realTime, startTime, initialMinutes]);

    const formatTime = (mins: number): string => {
        const hours = Math.floor(mins / 60);
        const remainingMins = mins % 60;
        return `${hours.toString().padStart(2, "0")}:${remainingMins
            .toString()
            .padStart(2, "0")}`;
    };

    const sizeClasses = {
        sm: "text-lg",
        md: "text-2xl",
        lg: "text-4xl",
    };

    return (
        <div className={cn("flex items-center gap-2", className)}>
            {showIcon && <Clock className={cn("h-5 w-5", size === "lg" && "h-8 w-8")} />}
            <div className="flex flex-col">
                <span className={cn("font-bold tabular-nums", sizeClasses[size])}>
                    {formatTime(minutes)}
                </span>
                {label && (
                    <span className="text-xs text-muted-foreground">{label}</span>
                )}
            </div>
        </div>
    );
}

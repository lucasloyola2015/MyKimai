import { cn } from "@/lib/utils";

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-muted",
                className
            )}
            {...props}
        />
    );
}

function SkeletonCard() {
    return (
        <div className="rounded-lg border bg-card p-6 space-y-3">
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-8 w-[120px]" />
            <Skeleton className="h-3 w-[150px]" />
        </div>
    );
}

function SkeletonText({ lines = 3 }: { lines?: number }) {
    return (
        <div className="space-y-2">
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    className={cn(
                        "h-4",
                        i === lines - 1 ? "w-[80%]" : "w-full"
                    )}
                />
            ))}
        </div>
    );
}

function SkeletonAvatar() {
    return <Skeleton className="h-10 w-10 rounded-full" />;
}

export { Skeleton, SkeletonCard, SkeletonText, SkeletonAvatar };

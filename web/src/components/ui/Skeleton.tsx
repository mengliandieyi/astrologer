import { cn } from "../../lib/cn";

export function Skeleton({ className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        "animate-pulse rounded-md bg-gradient-to-r from-black/5 via-black/10 to-black/5",
        className
      )}
    />
  );
}

export function SkeletonList({ rows = 4, rowClass = "h-8" }: { rows?: number; rowClass?: string }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={rowClass} />
      ))}
    </div>
  );
}

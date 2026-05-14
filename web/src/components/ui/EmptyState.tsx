import * as React from "react";
import { cn } from "../../lib/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-soft)] bg-white/30 px-4 py-10 text-center",
        className
      )}
    >
      <div className="text-[var(--fs-md)] font-semibold text-[var(--text-strong)]">{title}</div>
      {description ? (
        <div className="max-w-md text-[var(--fs-sm)] text-[var(--text-soft)]">{description}</div>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

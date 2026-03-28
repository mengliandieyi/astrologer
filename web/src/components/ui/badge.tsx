import * as React from "react";
import { cn } from "../../lib/cn";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)]",
        className
      )}
      {...props}
    />
  );
}


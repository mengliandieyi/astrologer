import * as React from "react";
import { cn } from "../../lib/cn";

type Variant = "page" | "panel" | "inset" | "soft";

const variantClass: Record<Variant, string> = {
  page: "rounded-[var(--radius-xl)] border border-[var(--border-soft)] bg-[var(--surface-card)] shadow-[var(--elev-card)]",
  panel: "rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[var(--elev-soft)] backdrop-blur-sm",
  inset: "rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--surface-soft)] shadow-[var(--elev-soft)]",
  soft: "rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-white/45",
};

export function Surface({
  variant = "panel",
  className,
  as: As = "div",
  ...rest
}: { variant?: Variant; as?: any } & React.HTMLAttributes<HTMLDivElement>) {
  return <As className={cn(variantClass[variant], className)} {...rest} />;
}

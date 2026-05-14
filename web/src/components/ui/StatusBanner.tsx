import * as React from "react";
import { cn } from "../../lib/cn";

type Tone = "info" | "success" | "warning" | "danger" | "neutral";

const toneClass: Record<Tone, string> = {
  info: "border-[color:var(--info)]/30 bg-[var(--info-soft)] text-[var(--info)]",
  success: "border-[color:var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]",
  warning: "border-[color:var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "border-[color:var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]",
  neutral: "border-[var(--border-soft)] bg-white/55 text-[var(--text-main)]",
};

export function StatusBanner({
  tone = "info",
  title,
  children,
  className,
  role,
  dismissible = false,
  onDismiss,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  role?: "status" | "alert";
  dismissible?: boolean;
  onDismiss?: () => void;
}) {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  const handleClose = () => {
    setOpen(false);
    onDismiss?.();
  };
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn(
        "relative rounded-[var(--radius-md)] border px-3 py-2 text-[var(--fs-sm)]",
        dismissible && "pr-9",
        toneClass[tone],
        className
      )}
    >
      {title ? <div className="font-semibold">{title}</div> : null}
      {children ? <div className={cn(title && "mt-1 opacity-90")}>{children}</div> : null}
      {dismissible ? (
        <button
          type="button"
          aria-label="关闭"
          onClick={handleClose}
          className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-current opacity-70 hover:bg-black/5 hover:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

import * as React from "react";
import { cn } from "../../lib/cn";

type Props = {
  title: React.ReactNode;
  hint?: React.ReactNode;
  /** 展开状态时右侧提示（未传则沿用 hint） */
  hintOpen?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  className?: string;
  /**
   * panel：独立卡片块（默认）。
   * ghost：无外边线、弱标题，适合已包在卡片/面板内，避免「盒套盒」。
   */
  variant?: "panel" | "ghost";
};

export function Disclosure({
  title,
  hint,
  hintOpen,
  defaultOpen = false,
  open: ctrl,
  onOpenChange,
  children,
  className,
  variant = "panel",
}: Props) {
  const [uncontrolled, setUncontrolled] = React.useState<boolean>(defaultOpen);
  const open = ctrl ?? uncontrolled;
  const set = (v: boolean) => {
    if (ctrl === undefined) setUncontrolled(v);
    onOpenChange?.(v);
  };
  const ghost = variant === "ghost";
  return (
    <div
      className={cn(
        ghost ? "rounded-md" : "rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-white/45",
        className
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => set(!open)}
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left",
          ghost ? "px-0 py-1" : "gap-3 px-3 py-2.5"
        )}
      >
        <span
          className={cn(
            ghost ? "text-xs font-medium text-[var(--text-muted)]" : "text-[var(--fs-sm)] font-semibold text-[var(--text-strong)]"
          )}
        >
          {title}
        </span>
        <span className={cn("flex shrink-0 items-center gap-1.5", ghost ? "text-[11px] text-[var(--text-muted)]" : "text-[var(--fs-xs)] text-[var(--text-soft)]")}>
          {open ? hintOpen ?? hint : hint}
          <svg
            width={ghost ? 12 : 14}
            height={ghost ? 12 : 14}
            viewBox="0 0 20 20"
            className={cn("opacity-80 transition-transform", open && "rotate-180")}
            aria-hidden
          >
            <path d="M5.5 8l4.5 4.5L14.5 8z" fill="currentColor" />
          </svg>
        </span>
      </button>
      {open ? (
        <div
          className={cn(
            ghost ? "border-t border-dashed border-[var(--border-soft)]/80 pt-2.5" : "border-t border-[var(--border-soft)] px-3 py-3"
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

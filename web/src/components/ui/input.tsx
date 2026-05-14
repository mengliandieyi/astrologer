import * as React from "react";
import { cn } from "../../lib/cn";

const base =
  "block w-full rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-white/65 px-3 py-2.5 text-[var(--fs-base)] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] shadow-[var(--elev-soft)] transition-colors hover:bg-white/80 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, invalid && "border-[var(--danger)]/60 bg-[var(--danger-soft)]", className)}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, "min-h-[88px] resize-y", invalid && "border-[var(--danger)]/60 bg-[var(--danger-soft)]", className)}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, children, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, "appearance-none bg-[length:14px_14px] bg-[right_0.7rem_center] bg-no-repeat pr-9", invalid && "border-[var(--danger)]/60", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2378716c'><path d='M5.5 8l4.5 4.5L14.5 8z'/></svg>\")",
      }}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";

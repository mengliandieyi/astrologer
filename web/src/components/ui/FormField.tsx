import * as React from "react";
import { cn } from "../../lib/cn";

type Props = {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  help?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function FormField({ label, htmlFor, required, help, error, className, children }: Props) {
  const helpId = htmlFor ? `${htmlFor}-help` : undefined;
  const errId = htmlFor ? `${htmlFor}-err` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="text-[var(--fs-xs)] font-semibold tracking-[0.04em] text-[var(--text-muted)]"
        >
          {label}
          {required ? <span className="ml-1 text-[var(--danger)]" aria-hidden>*</span> : null}
        </label>
      ) : null}
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<any>, {
            id: htmlFor,
            "aria-describedby": [error ? errId : null, help ? helpId : null].filter(Boolean).join(" ") || undefined,
            "aria-required": required || undefined,
          })
        : children}
      {help && !error ? (
        <div id={helpId} className="text-[var(--fs-xs)] text-[var(--text-soft)]">
          {help}
        </div>
      ) : null}
      {error ? (
        <div id={errId} className="text-[var(--fs-xs)] text-[var(--danger)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

import * as React from "react";
import { cn } from "../../lib/cn";

type Tone = "info" | "success" | "warning" | "danger";

type ToastItem = {
  id: number;
  message: React.ReactNode;
  tone: Tone;
  duration: number;
};

type Ctx = {
  show: (msg: React.ReactNode, opts?: { tone?: Tone; duration?: number }) => void;
};

const ToastContext = React.createContext<Ctx | null>(null);

let _id = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const remove = React.useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = React.useCallback(
    (message: React.ReactNode, opts?: { tone?: Tone; duration?: number }) => {
      const id = ++_id;
      const item: ToastItem = { id, message, tone: opts?.tone || "info", duration: opts?.duration ?? 3200 };
      setItems((xs) => [...xs, item]);
      if (item.duration > 0) window.setTimeout(() => remove(id), item.duration);
    },
    [remove]
  );
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[100] flex justify-center"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="flex w-full max-w-md flex-col items-stretch gap-2 px-3">
          {items.map((it) => (
            <div
              key={it.id}
              role={it.tone === "danger" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto rounded-[var(--radius-md)] border px-3 py-2 text-[var(--fs-sm)] shadow-[var(--elev-lifted)] backdrop-blur",
                it.tone === "info" && "border-[color:var(--info)]/30 bg-[var(--info-soft)] text-[var(--info)]",
                it.tone === "success" && "border-[color:var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]",
                it.tone === "warning" && "border-[color:var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--warning)]",
                it.tone === "danger" && "border-[color:var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]"
              )}
            >
              {it.message}
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return { show: () => {} };
  return ctx;
}

import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./button";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作：主按钮使用警示色 */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger,
  busy,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[100] bg-[rgba(12,10,9,0.42)] backdrop-blur-[2px]"
          aria-hidden
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[101] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-xl)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--elev-lifted)] outline-none"
          onPointerDownOutside={(e) => busy && e.preventDefault()}
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
        >
          <Dialog.Title className="text-base font-extrabold text-[var(--text-strong)]">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{description}</Dialog.Description>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" size="sm" disabled={busy}>
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              size="sm"
              variant={danger ? "secondary" : "primary"}
              className={danger ? "border-0 bg-[var(--danger)] text-white hover:brightness-110" : undefined}
              disabled={busy}
              onClick={() => void onConfirm()}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

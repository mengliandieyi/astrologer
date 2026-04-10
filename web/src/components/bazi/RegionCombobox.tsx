import { useEffect, useId, useRef, useState } from "react";

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  emptyHint?: string;
  onInputBlur?: (value: string) => void;
  inputClassName: string;
};

export function RegionCombobox(props: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={props.inputClassName}
        value={props.value}
        disabled={props.disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => props.onValueChange(e.target.value)}
        onBlur={() => {
          setOpen(false);
          window.setTimeout(() => props.onInputBlur?.(props.value), 0);
        }}
        placeholder={props.placeholder}
        autoComplete="off"
      />
      {open && !props.disabled ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[min(16rem,50vh)] overflow-y-auto rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] py-1 shadow-lg"
        >
          {props.options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--text-muted)]">{props.emptyHint ?? "暂无匹配项"}</div>
          ) : (
            props.options.map((opt) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={opt === props.value}
                className="flex w-full cursor-pointer px-3 py-2 text-left text-sm text-[var(--text-main)] hover:bg-[var(--surface-soft)]"
                onMouseDown={(e) => {
                  e.preventDefault();
                  props.onValueChange(opt);
                  setOpen(false);
                }}
              >
                {opt}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

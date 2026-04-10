import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err || "unknown_error");
    return { hasError: true, message };
  }

  componentDidCatch(err: unknown) {
     
    console.error("[ui_error_boundary]", err);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-5 shadow-sm">
          <div className="text-base font-extrabold text-[var(--text-strong)]">页面渲染异常</div>
          <div className="mt-2 text-sm text-[var(--text-muted)]">
            这通常是前端运行时报错或热更新状态异常导致的。你可以先刷新页面继续使用。
          </div>
          <pre className="mt-3 max-h-48 overflow-auto rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3 text-xs text-[var(--text-main)]">
            {String(this.state.message || "unknown_error")}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--surface-panel)]"
              onClick={() => window.location.reload()}
            >
              刷新页面
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--surface-panel)]"
              onClick={() => this.setState({ hasError: false, message: "" })}
            >
              尝试恢复
            </button>
          </div>
        </div>
      </div>
    );
  }
}


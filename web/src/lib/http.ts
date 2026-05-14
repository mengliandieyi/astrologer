import { friendlyError } from "./errorMessages";

export type FetchOpts = RequestInit & { timeoutMs?: number };

export class HttpError extends Error {
  status: number;
  code?: string;
  raw?: unknown;
  constructor(status: number, code: string | undefined, message: string, raw?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.raw = raw;
  }
}

function withTimeout(input: RequestInfo | URL, init: FetchOpts = {}) {
  const timeoutMs = init.timeoutMs ?? 15_000;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  const merged: RequestInit = {
    credentials: "include",
    ...init,
    signal: ctrl.signal,
  };
  delete (merged as any).timeoutMs;
  return fetch(input, merged).finally(() => window.clearTimeout(t));
}

async function parseError(res: Response): Promise<HttpError> {
  let code: string | undefined;
  let raw: unknown;
  try {
    raw = await res.json();
    if (raw && typeof raw === "object" && "error" in (raw as any)) {
      code = String((raw as any).error || "");
    }
  } catch {
    try {
      raw = await res.text();
      code = String(raw || "");
    } catch {
      /* noop */
    }
  }
  const message = friendlyError(code, res.status);
  // Surface extra debug context for common input-validation errors.
  let message2 = message;
  try {
    if (res.status === 404 && res.url) {
      try {
        const u = new URL(res.url);
        message2 = `${message2}（${u.pathname}）`;
      } catch {
        // ignore
      }
    }
    if (code === "symbol_invalid" && raw && typeof raw === "object" && "got" in (raw as any)) {
      const got = String((raw as any).got ?? "").replace(/\s+/g, " ").trim();
      if (got) message2 = `${message}（收到：${got.slice(0, 32)}）`;
    }
  } catch {
    /* ignore */
  }
  return new HttpError(res.status, code, message2, raw);
}

export async function getJson<T>(url: string, init: FetchOpts = {}): Promise<T> {
  const res = await withTimeout(url, { cache: "no-store", timeoutMs: 15_000, ...init });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body: unknown, init: FetchOpts = {}): Promise<T> {
  const res = await withTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
    ...init,
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export async function patchJson<T>(url: string, body: unknown, init: FetchOpts = {}): Promise<T> {
  const res = await withTimeout(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
    ...init,
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export async function delJson<T = void>(url: string, init: FetchOpts = {}): Promise<T> {
  const res = await withTimeout(url, { method: "DELETE", timeoutMs: 15_000, ...init });
  if (!res.ok) throw await parseError(res);
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

/** 将任意 error 转中文展示 */
export function errMsg(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof Error) return e.message || "请求失败";
  return String(e || "请求失败");
}

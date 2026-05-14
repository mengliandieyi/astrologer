import fs from "node:fs";
import path from "node:path";

export type ErrorLogEntry = {
  ts: string;
  source: "uncaught" | "unhandled" | "express" | "manual";
  message: string;
  stack?: string;
  meta?: Record<string, unknown>;
};

const MAX_BUFFER = 200;
const buffer: ErrorLogEntry[] = [];

function logsDir(): string {
  const dir = path.resolve(process.cwd(), "logs");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return dir;
}

function todayLogFile(): string {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(logsDir(), `errors-${d}.jsonl`);
}

export function logError(source: ErrorLogEntry["source"], err: unknown, meta?: Record<string, unknown>) {
  const e: any = err;
  const entry: ErrorLogEntry = {
    ts: new Date().toISOString(),
    source,
    message: String(e?.message || e || "unknown_error"),
    stack: typeof e?.stack === "string" ? e.stack.slice(0, 4000) : undefined,
    meta,
  };
  // ring buffer
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  // append to file (best-effort)
  try {
    fs.appendFileSync(todayLogFile(), JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // ignore disk errors
  }
  // also stderr to keep visible in pm2/journal
  try {
    console.error(`[err:${source}]`, entry.message, entry.stack ? `\n${entry.stack.split("\n").slice(0, 5).join("\n")}` : "");
  } catch {
    // ignore
  }
}

export function listRecentErrors(limit = 100): ErrorLogEntry[] {
  const n = Math.max(1, Math.min(MAX_BUFFER, Math.floor(limit)));
  return buffer.slice(-n).reverse();
}

let installed = false;
export function installGlobalErrorHooks() {
  if (installed) return;
  installed = true;
  process.on("unhandledRejection", (reason) => {
    logError("unhandled", reason);
  });
  process.on("uncaughtException", (err) => {
    logError("uncaught", err);
  });
}

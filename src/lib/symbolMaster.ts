import { pinyin } from "pinyin-pro";
import { tushareQuery } from "./tushareClient.js";

export type SymbolMasterItem = {
  ts_code: string; // 600519.SH
  code: string; // 600519
  name: string; // 贵州茅台
  exchange: "SH" | "SZ";
  market?: string | null;
  area?: string | null;
  industry?: string | null;
  // precomputed for search
  pinyin_full: string;
  pinyin_initials: string;
};

let cache: { items: SymbolMasterItem[]; loadedAtMs: number } | null = null;
let inflight: Promise<SymbolMasterItem[]> | null = null;

function normalizeQuery(raw: string) {
  return String(raw || "").trim().toLowerCase();
}

function buildPinyin(name: string) {
  const full = pinyin(name, { toneType: "none", nonZh: "removed", type: "array" }).join("");
  const initials = pinyin(name, { toneType: "none", nonZh: "removed", pattern: "first", type: "array" }).join("");
  return { full: full.toLowerCase(), initials: initials.toLowerCase() };
}

async function loadAllStockBasics(): Promise<SymbolMasterItem[]> {
  const rows = await tushareQuery({
    api_name: "stock_basic",
    params: { list_status: "L" },
    fields: ["ts_code", "symbol", "name", "exchange", "market", "area", "industry"],
  });

  const out: SymbolMasterItem[] = [];
  for (const r of rows as any[]) {
    const ts_code = String(r.ts_code || "").trim().toUpperCase();
    const code = String(r.symbol || "").trim();
    const name = String(r.name || "").trim();
    const ex = String(r.exchange || "").trim().toUpperCase();
    if (!ts_code || !code || !name) continue;
    const exchange: "SH" | "SZ" = ex === "SSE" || ts_code.endsWith(".SH") ? "SH" : "SZ";
    const py = buildPinyin(name);
    out.push({
      ts_code,
      code,
      name,
      exchange,
      market: r.market == null ? null : String(r.market),
      area: r.area == null ? null : String(r.area),
      industry: r.industry == null ? null : String(r.industry),
      pinyin_full: py.full,
      pinyin_initials: py.initials,
    });
  }
  return out;
}

async function ensureCache(): Promise<SymbolMasterItem[]> {
  const ttlMs = 24 * 3600_000;
  const now = Date.now();
  if (cache && now - cache.loadedAtMs < ttlMs) return cache.items;
  if (inflight) return inflight;
  inflight = loadAllStockBasics()
    .then((items) => {
      cache = { items, loadedAtMs: Date.now() };
      return items;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function searchSymbolMaster(args: { q: string; limit: number }): Promise<SymbolMasterItem[]> {
  const q = normalizeQuery(args.q);
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(50, Math.floor(args.limit))) : 20;
  if (!q) return [];

  const items = await ensureCache();
  const digits = q.replace(/\D/g, "");
  const isCodeLike = digits.length >= 3;

  const hits: Array<{ score: number; item: SymbolMasterItem }> = [];
  for (const it of items) {
    const code = it.code;
    const name = it.name.toLowerCase();
    let score = -1;

    if (digits && code.startsWith(digits)) score = 1000 - (code.length - digits.length);
    else if (isCodeLike && code.includes(digits)) score = 700;
    else if (name.includes(q)) score = q.length >= 2 ? 650 + Math.min(50, q.length) : 600;
    else if (it.pinyin_full.includes(q)) score = 520;
    else if (it.pinyin_initials.startsWith(q)) score = 560;
    else if (it.pinyin_initials.includes(q)) score = 480;

    if (score >= 0) hits.push({ score, item: it });
  }

  hits.sort((a, b) => b.score - a.score || a.item.ts_code.localeCompare(b.item.ts_code));
  return hits.slice(0, limit).map((h) => h.item);
}


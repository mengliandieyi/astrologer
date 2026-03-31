export type Freq = "1d" | "1w" | "1m";

export type StockAiSummary = {
  effective_asof: string;
  symbol: string;
  freq: Freq;
  overall_view: "bullish" | "neutral" | "bearish";
  risk_level: 1 | 2 | 3 | 4 | 5;
  key_levels: Array<{ kind: "support" | "resistance" | "stop_loss"; price: number | null; note: string }>;
  signals: Array<{ strategy: "左侧埋伏" | "右侧确认" | "超短反转"; status: "hit" | "near" | "miss"; why: string[] }>;
  risk_points: string[];
  action_rules: string[];
  evidence_note?: string;
  snapshot_json?: Record<string, unknown>;
  reasons_json?: Record<string, unknown>;
};

export type StockAiAnswer = {
  request_id: string;
  effective_asof: string;
  symbol: string;
  freq: Freq;
  text: string;
  bullets: string[];
  evidence: Array<{ source: string; fields: string[] }>;
};

export type StockAiMessage = { role: "user" | "assistant"; content: string };

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export async function createStockAiAnalysis(symbol: string, args: { asof: "today" | string; freq: Freq }): Promise<{
  ai_analysis_id: number;
  effective_asof: string;
  freq: Freq;
  summary: StockAiSummary;
}> {
  return postJson(`/api/symbols/${encodeURIComponent(symbol)}/ai-analyses`, args);
}

export async function askStockAi(aiAnalysisId: number, question: string): Promise<{ ai_analysis_id: number; answer: StockAiAnswer }> {
  return postJson(`/api/ai-analyses/${encodeURIComponent(String(aiAnalysisId))}/messages`, { question });
}

export async function getStockAiAnalysis(aiAnalysisId: number): Promise<{
  ai_analysis: {
    id: number;
    user_id: number;
    symbol: string;
    effective_asof: string;
    freq: Freq;
    request_json: Record<string, unknown>;
    response_json: StockAiSummary;
    created_at: string;
  };
  messages: StockAiMessage[];
}> {
  return getJson(`/api/ai-analyses/${encodeURIComponent(String(aiAnalysisId))}`);
}

export type Candle = { t: string; open: number; high: number; low: number; close: number; vol: number; amount: number };

export type StockSnapshot = {
  ts_code: string;
  name: string | null;
  asof: string;
  industry: string | null;
  area: string | null;
  pct_chg_1d: number | null;
  pct_chg_5d: number | null;
  pct_chg_20d: number | null;
  pe_ttm: number | null;
  pb?: number | null;
  ps_ttm?: number | null;
  dv_ttm?: number | null;
  turnover_rate: number | null;
  amount: number | null;
  total_mv: number | null;
  circ_mv: number | null;
};

export type StockFundamentals = {
  asof: string;
  report_end_date: string | null;
  pe_ttm: number | null;
  pb: number | null;
  ps_ttm: number | null;
  dv_ttm: number | null;
  roe: number | null;
  grossprofit_margin: number | null;
  netprofit_margin: number | null;
  yoy_sales: number | null;
  yoy_netprofit: number | null;
  debt_to_assets: number | null;
  notes?: string;
};

export type StrategySignal = {
  strategy: "左侧埋伏" | "右侧确认" | "超短反转";
  status: "hit" | "near" | "miss";
  why: string[];
};

export async function getSymbolAnalysis(symbol: string): Promise<{
  symbol: string;
  effective_asof: string;
  snapshot_json: StockSnapshot;
  fundamentals_json?: StockFundamentals;
  signals: StrategySignal[];
  reasons_json: Record<string, unknown>;
  key_levels?: Array<{ kind: "support" | "resistance" | "stop_loss"; price: number | null; note: string }>;
}> {
  return getJson(`/api/symbols/${encodeURIComponent(symbol)}/analysis`);
}

export async function getKlines(args: {
  symbol: string;
  from: string;
  to: string;
  freq: Freq;
  adjust: "hfq" | "qfq" | "none";
}): Promise<{ symbol: string; freq: Freq; adjust: string; candles: Candle[] }> {
  const qs = new URLSearchParams({ from: args.from, to: args.to, freq: args.freq, adjust: args.adjust }).toString();
  return getJson(`/api/symbols/${encodeURIComponent(args.symbol)}/klines?${qs}`);
}


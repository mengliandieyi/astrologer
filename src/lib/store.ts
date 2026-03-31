import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import mysql from "mysql2/promise";
import { Pool } from "pg";
import type { BirthMeta } from "./baziExtendedMeta.js";

export type StoredChart = {
  chart_id: string;
  created_at: string;
  /** 登录后归属的用户ID（MySQL/PG 存储用）；分享/匿名盘可能为空 */
  user_id?: number;
  /** 人物档案（profile）归属；同一账号可有多个 profile */
  profile_id?: number;
  /** 0 女 1 男，排盘时写入，供解读提示词使用 */
  gender?: 0 | 1;
  /** 用户填写的出生地文案（省市区拼接等），用于分享卡与展示 */
  birth_location?: string;
  /** 排盘请求中的日期/时间/时区，分享链接回填左侧表单 */
  birth_date?: string;
  birth_time?: string;
  birth_timezone?: string;
  birth_meta?: BirthMeta;
  basic_summary: string;
  pillars: Record<string, string>;
  five_elements: Record<string, number>;
  true_solar_time?: string;
  jie_qi?: string;
  ten_gods?: {
    gan: { year: string; month: string; day: string; hour: string };
    zhi_main: { year: string; month: string; day: string; hour: string };
  };
  ge_ju?: string;
  jie_qi_window?: {
    current: string;
    prev: { name: string; time: string };
    next: { name: string; time: string };
  };
  day_master?: {
    gan: string;
    element: string;
    strength_score: number;
    strength_level: "weak" | "balanced" | "strong";
    useful_elements: string[];
    avoid_elements: string[];
  };
  calendar_meta?: {
    input_calendar: "solar" | "lunar";
    solar_datetime: string;
    lunar_datetime: string;
  };
  fortune_cycles?: {
    yun_start: string;
    da_yun: Array<{
      gan_zhi: string;
      start_year: number;
      end_year: number;
      start_age?: number;
      ten_god_short?: string;
      love?: string;
      wealth?: string;
      career?: string;
      health?: string;
      summary?: string;
      shen_sha?: Array<{ name: string; type: string; effect: string; basis: string }>;
    }>;
    liu_nian_preview: Array<{
      year: number;
      gan_zhi: string;
      ten_god_short?: string;
      love?: string;
      wealth?: string;
      career?: string;
      health?: string;
      summary?: string;
      shen_sha?: Array<{ name: string; type: string; effect: string; basis: string }>;
    }>;
    liu_yue_preview?: Array<{
      year: number;
      month: number;
      gan_zhi: string;
      ten_god_short?: string;
      love?: string;
      wealth?: string;
      career?: string;
      health?: string;
      summary?: string;
      shen_sha?: Array<{ name: string; type: string; effect: string; basis: string }>;
    }>;
  };
  shen_sha_by_pillar?: {
    year: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
    month: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
    day: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
    hour: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
  };
  shen_sha?: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis?: string }>;
  user_readable?: {
    one_line: string;
    actions: string[];
    cautions: string[];
    liu_nian_tips: Array<{ year: number; label: string; tip: string }>;
  };
};

export type StoredEvent = {
  event_name: string;
  anon_id: string;
  session_id: string;
  user_id?: number;
  profile_id?: number;
  chart_id?: string;
  report_id?: string;
  ab_group?: "A" | "B";
  props?: Record<string, unknown>;
  created_at: string;
};

export type StoredHepanReport = {
  id: number;
  user_id: number;
  profile_id_a: number;
  profile_id_b: number;
  profile_name_a?: string;
  profile_name_b?: string;
  payload?: Record<string, unknown>;
  ai_text: string;
  provider: string;
  created_at: string;
  updated_at: string;
};

export type StoredProfile = {
  id: number;
  user_id: number;
  name: string;
  /** 档案固定字段（出生信息/联系/备注等）；历史数据可能为空对象 */
  meta?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type DbShape = {
  charts: StoredChart[];
  events: StoredEvent[];
};

export type StoredStockAiAnalysis = {
  id: number;
  user_id: number;
  symbol: string;
  effective_asof: string;
  freq: "1d" | "1w" | "1m";
  request_json: Record<string, unknown>;
  response_json: Record<string, unknown>;
  created_at: string;
};

export type StoredStockAiMessage = {
  id: number;
  ai_analysis_id: number;
  role: "user" | "assistant";
  content: string;
  meta_json?: Record<string, unknown>;
  created_at: string;
};

export type StockScreenerStrategy = "左侧埋伏" | "右侧确认" | "超短反转";
export type StockScreenerRunStatus = "running" | "success" | "failed";

export type StoredStockScreenerRun = {
  id: number;
  user_id: number;
  strategy: StockScreenerStrategy;
  effective_asof: string;
  freq: "1d" | "1w" | "1m";
  params_json: Record<string, unknown>;
  status: StockScreenerRunStatus;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type StoredStockScreenerResult = {
  id: number;
  run_id: number;
  symbol: string;
  name: string | null;
  score: number | null;
  snapshot_json: Record<string, unknown>;
  reasons_json: Record<string, unknown>;
  created_at: string;
};

const dataDir = path.resolve(process.cwd(), "data");
const dbFile = path.join(dataDir, "db.json");
const sqliteFile = path.join(dataDir, "app.db");
const databaseUrl = process.env.DATABASE_URL;
const mysqlUrl = process.env.MYSQL_URL;
const configuredMode = process.env.STORAGE_MODE;
const storageMode =
  configuredMode === "file" ||
  configuredMode === "sqlite" ||
  configuredMode === "postgres" ||
  configuredMode === "mysql"
    ? configuredMode
    : databaseUrl
      ? "postgres"
      : mysqlUrl
        ? "mysql"
      : "sqlite";
let pgPool: Pool | null = null;
let pgReady = false;
let sqliteDb: DatabaseSync | null = null;
let sqliteReady = false;
let mysqlPool: mysql.Pool | null = null;
let mysqlReady = false;
const mysqlUrlForTokens = process.env.MYSQL_URL;

/** file 存储模式下的灵犀缓存（进程内，重启清空） */
const fileModeAiCache = new Map<string, { ai_text: string; provider: string }>();
function aiCacheKey(chartId: string, analystMode: string) {
  return `${chartId}\0${analystMode}`;
}

async function ensureMysql(): Promise<mysql.Pool> {
  if (!mysqlUrl) throw new Error("MYSQL_URL_NOT_SET");
  if (!mysqlPool) {
    const sep = mysqlUrl.includes("?") ? "&" : "?";
    const urlWithOpts =
      mysqlUrl +
      `${sep}connectTimeout=6000&enableKeepAlive=true&keepAliveInitialDelay=0&connectionLimit=6&waitForConnections=true`;
    mysqlPool = mysql.createPool(urlWithOpts);
  }
  if (!mysqlReady) {
    const pool = mysqlPool;
    await pool.execute(`
      create table if not exists profiles (
        id bigint primary key auto_increment,
        user_id bigint not null,
        name varchar(64) not null,
        meta mediumtext not null,
        created_at datetime not null,
        updated_at datetime not null,
        unique key uniq_profiles_user_name (user_id, name),
        index idx_profiles_user (user_id)
      );
    `);
    // Backward-compatible migration: older installs may not have meta column.
    try {
      // Add as NULL first to avoid failing when table already has rows.
      await pool.execute("alter table profiles add column meta mediumtext null");
    } catch {
      // ignore (already exists)
    }
    // Ensure meta is non-null for legacy rows.
    try {
      await pool.execute("update profiles set meta='{}' where meta is null");
    } catch {
      // ignore
    }
    try {
      await pool.execute("alter table profiles modify column meta mediumtext not null");
    } catch {
      // ignore
    }
    // Minimal schema: users will be created by auth module; core data tables here.
    await pool.execute(`
      create table if not exists charts (
        chart_id varchar(36) primary key,
        user_id bigint null,
        profile_id bigint null,
        payload json not null,
        created_at datetime not null,
        index idx_charts_user (user_id),
        index idx_charts_profile (profile_id)
      );
    `);
    await pool.execute(`
      create table if not exists events (
        id bigint primary key auto_increment,
        event_name varchar(64) not null,
        anon_id varchar(128) not null,
        session_id varchar(128) not null,
        user_id bigint null,
        profile_id bigint null,
        chart_id varchar(36) null,
        report_id varchar(64) null,
        ab_group varchar(8) null,
        props json not null,
        created_at datetime not null,
        index idx_events_created_at (created_at),
        index idx_events_name (event_name)
      );
    `);
    await pool.execute(`
      create table if not exists ai_reading_cache (
        chart_id varchar(36) not null,
        analyst_mode varchar(16) not null,
        ai_text mediumtext not null,
        provider varchar(32) not null,
        updated_at datetime not null,
        primary key (chart_id, analyst_mode)
      );
    `);
    await pool.execute(`
      create table if not exists password_reset_tokens (
        id bigint primary key auto_increment,
        user_id bigint not null,
        token_hash char(64) not null,
        expires_at datetime not null,
        used_at datetime null,
        created_at datetime not null,
        index idx_prt_user (user_id),
        unique key uniq_prt_token_hash (token_hash)
      );
    `);

    await pool.execute(`
      create table if not exists hepan_reports (
        id bigint primary key auto_increment,
        user_id bigint not null,
        profile_id_a bigint not null,
        profile_id_b bigint not null,
        profile_name_a varchar(64) null,
        profile_name_b varchar(64) null,
        payload json not null,
        ai_text mediumtext not null,
        provider varchar(32) not null,
        created_at datetime not null,
        updated_at datetime not null,
        unique key uniq_hepan_user_pair (user_id, profile_id_a, profile_id_b),
        index idx_hepan_user (user_id),
        index idx_hepan_updated (updated_at)
      );
    `);

    await pool.execute(`
      create table if not exists stock_ai_analyses (
        id bigint primary key auto_increment,
        user_id bigint not null,
        symbol varchar(16) not null,
        effective_asof date not null,
        freq varchar(2) not null,
        request_json json not null,
        response_json json not null,
        created_at datetime not null,
        index idx_stock_ai_user_created (user_id, created_at),
        index idx_stock_ai_symbol_asof (symbol, effective_asof)
      );
    `);
    await pool.execute(`
      create table if not exists stock_ai_messages (
        id bigint primary key auto_increment,
        ai_analysis_id bigint not null,
        role varchar(16) not null,
        content mediumtext not null,
        meta_json json null,
        created_at datetime not null,
        index idx_stock_ai_msg_analysis_created (ai_analysis_id, created_at)
      );
    `);

    await pool.execute(`
      create table if not exists stock_daily_cache (
        ts_code varchar(16) not null,
        trade_date char(8) not null,
        open double not null,
        high double not null,
        low double not null,
        close double not null,
        vol double not null,
        amount double not null,
        primary key (ts_code, trade_date),
        index idx_sdc_trade_date (trade_date),
        index idx_sdc_ts_code (ts_code)
      );
    `);

    await pool.execute(`
      create table if not exists stock_screener_runs (
        id bigint primary key auto_increment,
        user_id bigint not null,
        strategy varchar(16) not null,
        effective_asof date not null,
        freq varchar(2) not null,
        params_json json not null,
        status varchar(16) not null,
        error mediumtext null,
        started_at datetime not null,
        finished_at datetime null,
        index idx_ssr_user_started (user_id, started_at),
        index idx_ssr_status_started (status, started_at)
      );
    `);

    await pool.execute(`
      create table if not exists stock_screener_results (
        id bigint primary key auto_increment,
        run_id bigint not null,
        symbol varchar(16) not null,
        name varchar(64) null,
        score double null,
        snapshot_json json not null,
        reasons_json json not null,
        created_at datetime not null,
        index idx_ssres_run_score (run_id, score),
        index idx_ssres_run_symbol (run_id, symbol)
      );
    `);
    mysqlReady = true;
  }
  return mysqlPool!;
}

function parseProfileMeta(raw: any): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function ensureDbFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    const init: DbShape = { charts: [], events: [] };
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2), "utf8");
  }
}

function readDb(): DbShape {
  ensureDbFile();
  return JSON.parse(fs.readFileSync(dbFile, "utf8")) as DbShape;
}

function writeDb(db: DbShape) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");
}

function ensureSqlite(): DatabaseSync {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!sqliteDb) sqliteDb = new DatabaseSync(sqliteFile);
  if (!sqliteReady) {
    sqliteDb.exec(`
      create table if not exists charts (
        chart_id text primary key,
        payload text not null,
        created_at text not null
      );
      create table if not exists events (
        id integer primary key autoincrement,
        event_name text not null,
        anon_id text not null,
        session_id text not null,
        chart_id text,
        report_id text,
        ab_group text,
        props text not null,
        created_at text not null
      );
      create index if not exists idx_events_created_at on events(created_at);
      create index if not exists idx_events_name on events(event_name);
      create table if not exists ai_reading_cache (
        chart_id text not null,
        analyst_mode text not null,
        ai_text text not null,
        provider text not null,
        updated_at text not null,
        primary key (chart_id, analyst_mode)
      );
      create table if not exists stock_ai_analyses (
        id integer primary key autoincrement,
        user_id integer not null,
        symbol text not null,
        effective_asof text not null,
        freq text not null,
        request_json text not null,
        response_json text not null,
        created_at text not null
      );
      create index if not exists idx_stock_ai_user_created on stock_ai_analyses(user_id, created_at);
      create index if not exists idx_stock_ai_symbol_asof on stock_ai_analyses(symbol, effective_asof);
      create table if not exists stock_ai_messages (
        id integer primary key autoincrement,
        ai_analysis_id integer not null,
        role text not null,
        content text not null,
        meta_json text,
        created_at text not null
      );
      create index if not exists idx_stock_ai_msg_analysis_created on stock_ai_messages(ai_analysis_id, created_at);

      create table if not exists stock_daily_cache (
        ts_code text not null,
        trade_date text not null,
        open real not null,
        high real not null,
        low real not null,
        close real not null,
        vol real not null,
        amount real not null,
        primary key (ts_code, trade_date)
      );
      create index if not exists idx_sdc_trade_date on stock_daily_cache(trade_date);
      create index if not exists idx_sdc_ts_code on stock_daily_cache(ts_code);

      create table if not exists stock_screener_runs (
        id integer primary key autoincrement,
        user_id integer not null,
        strategy text not null,
        effective_asof text not null,
        freq text not null,
        params_json text not null,
        status text not null,
        error text,
        started_at text not null,
        finished_at text
      );
      create index if not exists idx_ssr_user_started on stock_screener_runs(user_id, started_at);
      create index if not exists idx_ssr_status_started on stock_screener_runs(status, started_at);

      create table if not exists stock_screener_results (
        id integer primary key autoincrement,
        run_id integer not null,
        symbol text not null,
        name text,
        score real,
        snapshot_json text not null,
        reasons_json text not null,
        created_at text not null
      );
      create index if not exists idx_ssres_run_score on stock_screener_results(run_id, score);
      create index if not exists idx_ssres_run_symbol on stock_screener_results(run_id, symbol);
    `);
    sqliteReady = true;
  }
  return sqliteDb;
}

async function ensurePg(): Promise<Pool> {
  if (!databaseUrl) throw new Error("DATABASE_URL_NOT_SET");
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  if (!pgReady) {
    await pgPool.query(`
      create table if not exists charts (
        chart_id text primary key,
        payload jsonb not null,
        created_at timestamptz not null default now()
      );
      create table if not exists events (
        id bigserial primary key,
        event_name text not null,
        anon_id text not null,
        session_id text not null,
        chart_id text,
        report_id text,
        ab_group text,
        props jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists idx_events_created_at on events(created_at);
      create index if not exists idx_events_name on events(event_name);
      create table if not exists ai_reading_cache (
        chart_id text not null,
        analyst_mode text not null,
        ai_text text not null,
        provider text not null,
        updated_at timestamptz not null default now(),
        primary key (chart_id, analyst_mode)
      );

      create table if not exists stock_ai_analyses (
        id bigserial primary key,
        user_id bigint not null,
        symbol text not null,
        effective_asof date not null,
        freq text not null,
        request_json jsonb not null default '{}'::jsonb,
        response_json jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists idx_stock_ai_user_created on stock_ai_analyses(user_id, created_at);
      create index if not exists idx_stock_ai_symbol_asof on stock_ai_analyses(symbol, effective_asof);

      create table if not exists stock_ai_messages (
        id bigserial primary key,
        ai_analysis_id bigint not null,
        role text not null,
        content text not null,
        meta_json jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists idx_stock_ai_msg_analysis_created on stock_ai_messages(ai_analysis_id, created_at);

      create table if not exists stock_daily_cache (
        ts_code text not null,
        trade_date char(8) not null,
        open double precision not null,
        high double precision not null,
        low double precision not null,
        close double precision not null,
        vol double precision not null,
        amount double precision not null,
        primary key (ts_code, trade_date)
      );
      create index if not exists idx_sdc_trade_date on stock_daily_cache(trade_date);
      create index if not exists idx_sdc_ts_code on stock_daily_cache(ts_code);

      create table if not exists stock_screener_runs (
        id bigserial primary key,
        user_id bigint not null,
        strategy text not null,
        effective_asof date not null,
        freq text not null,
        params_json jsonb not null default '{}'::jsonb,
        status text not null,
        error text,
        started_at timestamptz not null default now(),
        finished_at timestamptz
      );
      create index if not exists idx_ssr_user_started on stock_screener_runs(user_id, started_at);
      create index if not exists idx_ssr_status_started on stock_screener_runs(status, started_at);

      create table if not exists stock_screener_results (
        id bigserial primary key,
        run_id bigint not null,
        symbol text not null,
        name text,
        score double precision,
        snapshot_json jsonb not null default '{}'::jsonb,
        reasons_json jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists idx_ssres_run_score on stock_screener_results(run_id, score);
      create index if not exists idx_ssres_run_symbol on stock_screener_results(run_id, symbol);
    `);
    pgReady = true;
  }
  return pgPool;
}

export async function createStockScreenerRun(args: {
  user_id: number;
  strategy: StockScreenerStrategy;
  effective_asof: string;
  freq: "1d" | "1w" | "1m";
  params_json: Record<string, unknown>;
}): Promise<StoredStockScreenerRun> {
  const startedAt = new Date();
  const status: StockScreenerRunStatus = "running";
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [res] = await pool.execute<mysql.ResultSetHeader>(
      "insert into stock_screener_runs(user_id, strategy, effective_asof, freq, params_json, status, error, started_at, finished_at) values(?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        args.user_id,
        args.strategy,
        args.effective_asof,
        args.freq,
        JSON.stringify(args.params_json ?? {}),
        status,
        null,
        toMysqlDatetime(startedAt),
        null,
      ]
    );
    return {
      id: Number(res.insertId),
      user_id: args.user_id,
      strategy: args.strategy,
      effective_asof: args.effective_asof,
      freq: args.freq,
      params_json: args.params_json ?? {},
      status,
      error: null,
      started_at: toMysqlDatetime(startedAt),
      finished_at: null,
    };
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const r = await pool.query(
      "insert into stock_screener_runs(user_id, strategy, effective_asof, freq, params_json, status, error) values($1,$2,$3,$4,$5,$6,$7) returning id, started_at",
      [args.user_id, args.strategy, args.effective_asof, args.freq, args.params_json ?? {}, status, null]
    );
    const row = r.rows?.[0] as any;
    return {
      id: Number(row.id),
      user_id: args.user_id,
      strategy: args.strategy,
      effective_asof: args.effective_asof,
      freq: args.freq,
      params_json: args.params_json ?? {},
      status,
      error: null,
      started_at: new Date(row.started_at).toISOString(),
      finished_at: null,
    };
  }
  const db = ensureSqlite();
  db.prepare(
    "insert into stock_screener_runs(user_id, strategy, effective_asof, freq, params_json, status, error, started_at, finished_at) values(?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    args.user_id,
    args.strategy,
    args.effective_asof,
    args.freq,
    JSON.stringify(args.params_json ?? {}),
    status,
    null,
    startedAt.toISOString(),
    null
  );
  const id = Number(db.prepare("select last_insert_rowid() as id").get()?.id || 0);
  return {
    id,
    user_id: args.user_id,
    strategy: args.strategy,
    effective_asof: args.effective_asof,
    freq: args.freq,
    params_json: args.params_json ?? {},
    status,
    error: null,
    started_at: startedAt.toISOString(),
    finished_at: null,
  };
}

export async function finishStockScreenerRun(args: {
  run_id: number;
  status: Exclude<StockScreenerRunStatus, "running">;
  error?: string | null;
}): Promise<void> {
  const finishedAt = new Date();
  const err = args.error ? String(args.error).slice(0, 5000) : null;
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    await pool.execute("update stock_screener_runs set status = ?, error = ?, finished_at = ? where id = ? limit 1", [
      args.status,
      err,
      toMysqlDatetime(finishedAt),
      args.run_id,
    ]);
    return;
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    await pool.query("update stock_screener_runs set status=$1, error=$2, finished_at=now() where id=$3", [
      args.status,
      err,
      args.run_id,
    ]);
    return;
  }
  const db = ensureSqlite();
  db.prepare("update stock_screener_runs set status=?, error=?, finished_at=? where id=?").run(
    args.status,
    err,
    finishedAt.toISOString(),
    args.run_id
  );
}

export async function insertStockScreenerResults(args: {
  run_id: number;
  items: Array<{
    symbol: string;
    name: string | null;
    score: number | null;
    snapshot_json: Record<string, unknown>;
    reasons_json: Record<string, unknown>;
  }>;
}): Promise<void> {
  const createdAt = new Date();
  if (!args.items.length) return;
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const now = toMysqlDatetime(createdAt);
    for (const it of args.items) {
      await pool.execute(
        "insert into stock_screener_results(run_id, symbol, name, score, snapshot_json, reasons_json, created_at) values(?, ?, ?, ?, ?, ?, ?)",
        [
          args.run_id,
          it.symbol,
          it.name ? String(it.name).slice(0, 64) : null,
          it.score == null ? null : Number(it.score),
          JSON.stringify(it.snapshot_json ?? {}),
          JSON.stringify(it.reasons_json ?? {}),
          now,
        ]
      );
    }
    return;
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    for (const it of args.items) {
      await pool.query(
        "insert into stock_screener_results(run_id, symbol, name, score, snapshot_json, reasons_json) values($1,$2,$3,$4,$5,$6)",
        [args.run_id, it.symbol, it.name, it.score, it.snapshot_json ?? {}, it.reasons_json ?? {}]
      );
    }
    return;
  }
  const db = ensureSqlite();
  const stmt = db.prepare(
    "insert into stock_screener_results(run_id, symbol, name, score, snapshot_json, reasons_json, created_at) values(?, ?, ?, ?, ?, ?, ?)"
  );
  for (const it of args.items) {
    stmt.run(
      args.run_id,
      it.symbol,
      it.name,
      it.score == null ? null : Number(it.score),
      JSON.stringify(it.snapshot_json ?? {}),
      JSON.stringify(it.reasons_json ?? {}),
      createdAt.toISOString()
    );
  }
}

export async function listStockScreenerRuns(args: {
  user_id: number;
  limit?: number;
}): Promise<StoredStockScreenerRun[]> {
  const lim = Number.isFinite(args.limit) ? Math.max(1, Math.min(50, Math.floor(args.limit!))) : 20;
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `select id, user_id, strategy, effective_asof, freq, params_json, status, error, started_at, finished_at
       from stock_screener_runs
       where user_id = ?
       order by id desc
       limit ${lim}`,
      [args.user_id]
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      user_id: Number(r.user_id),
      strategy: String(r.strategy) as any,
      effective_asof: formatMysqlDateLike(r.effective_asof),
      freq: String(r.freq) as any,
      params_json: typeof r.params_json === "string" ? JSON.parse(r.params_json) : (r.params_json ?? {}),
      status: String(r.status) as any,
      error: r.error == null ? null : String(r.error),
      started_at: formatMysqlDatetimeLike(r.started_at),
      finished_at: r.finished_at == null ? null : formatMysqlDatetimeLike(r.finished_at),
    }));
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const r = await pool.query(
      "select id, user_id, strategy, effective_asof, freq, params_json, status, error, started_at, finished_at from stock_screener_runs where user_id=$1 order by id desc limit $2",
      [args.user_id, lim]
    );
    return (r.rows as any[]).map((x) => ({
      id: Number(x.id),
      user_id: Number(x.user_id),
      strategy: String(x.strategy) as any,
      effective_asof: String(x.effective_asof),
      freq: String(x.freq) as any,
      params_json: x.params_json ?? {},
      status: String(x.status) as any,
      error: x.error == null ? null : String(x.error),
      started_at: new Date(x.started_at).toISOString(),
      finished_at: x.finished_at ? new Date(x.finished_at).toISOString() : null,
    }));
  }
  const db = ensureSqlite();
  const rows = db
    .prepare(
      "select id, user_id, strategy, effective_asof, freq, params_json, status, error, started_at, finished_at from stock_screener_runs where user_id = ? order by id desc limit ?"
    )
    .all(args.user_id, lim) as any[];
  return rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    strategy: String(r.strategy) as any,
    effective_asof: String(r.effective_asof),
    freq: String(r.freq) as any,
    params_json: JSON.parse(String(r.params_json || "{}")),
    status: String(r.status) as any,
    error: r.error == null ? null : String(r.error),
    started_at: String(r.started_at),
    finished_at: r.finished_at == null ? null : String(r.finished_at),
  }));
}

export async function listStockScreenerResults(args: {
  run_id: number;
  limit?: number;
}): Promise<StoredStockScreenerResult[]> {
  const lim = Number.isFinite(args.limit) ? Math.max(1, Math.min(300, Math.floor(args.limit!))) : 50;
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `select id, run_id, symbol, name, score, snapshot_json, reasons_json, created_at
       from stock_screener_results
       where run_id = ?
       order by score desc, id asc
       limit ${lim}`,
      [args.run_id]
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      run_id: Number(r.run_id),
      symbol: String(r.symbol),
      name: r.name == null ? null : String(r.name),
      score: r.score == null ? null : Number(r.score),
      snapshot_json: typeof r.snapshot_json === "string" ? JSON.parse(r.snapshot_json) : (r.snapshot_json ?? {}),
      reasons_json: typeof r.reasons_json === "string" ? JSON.parse(r.reasons_json) : (r.reasons_json ?? {}),
      created_at: formatMysqlDatetimeLike(r.created_at),
    }));
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const r = await pool.query(
      "select id, run_id, symbol, name, score, snapshot_json, reasons_json, created_at from stock_screener_results where run_id=$1 order by score desc nulls last, id asc limit $2",
      [args.run_id, lim]
    );
    return (r.rows as any[]).map((x) => ({
      id: Number(x.id),
      run_id: Number(x.run_id),
      symbol: String(x.symbol),
      name: x.name == null ? null : String(x.name),
      score: x.score == null ? null : Number(x.score),
      snapshot_json: x.snapshot_json ?? {},
      reasons_json: x.reasons_json ?? {},
      created_at: new Date(x.created_at).toISOString(),
    }));
  }
  const db = ensureSqlite();
  const rows = db
    .prepare(
      "select id, run_id, symbol, name, score, snapshot_json, reasons_json, created_at from stock_screener_results where run_id = ? order by score desc limit ?"
    )
    .all(args.run_id, lim) as any[];
  return rows.map((r) => ({
    id: Number(r.id),
    run_id: Number(r.run_id),
    symbol: String(r.symbol),
    name: r.name == null ? null : String(r.name),
    score: r.score == null ? null : Number(r.score),
    snapshot_json: JSON.parse(String(r.snapshot_json || "{}")),
    reasons_json: JSON.parse(String(r.reasons_json || "{}")),
    created_at: String(r.created_at),
  }));
}

function toMysqlDatetime(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

function formatMysqlDatetimeLike(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return toMysqlDatetime(v);
  const s = String(v);
  // If mysql2 returned a Date string like "Tue Mar 31 2026 11:22:28 GMT+0800 (China Standard Time)",
  // try to parse and reformat. If parsing fails, keep original.
  const t = Date.parse(s);
  if (Number.isFinite(t)) return toMysqlDatetime(new Date(t));
  return s;
}

function formatMysqlDateLike(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // Accept yyyy-mm-dd as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  // Accept mysql date strings like "2026-03-31T00:00:00.000Z" if any
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

async function ensureMysqlForTokens(): Promise<mysql.Pool> {
  // Reuse same MYSQL_URL; share connection pool.
  if (!mysqlUrlForTokens) throw new Error("MYSQL_URL_NOT_SET");
  return ensureMysql();
}

export async function createPasswordResetToken(args: {
  user_id: number;
  token_hash: string;
  expires_at: Date;
}): Promise<void> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysqlForTokens();
  await pool.execute(
    "insert into password_reset_tokens(user_id, token_hash, expires_at, created_at) values(?, ?, ?, ?)",
    [args.user_id, args.token_hash, toMysqlDatetime(args.expires_at), toMysqlDatetime(new Date())]
  );
}

export async function consumePasswordResetToken(token_hash: string): Promise<{ user_id: number } | null> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysqlForTokens();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `select id, user_id, expires_at, used_at
     from password_reset_tokens
     where token_hash = ?
     limit 1`,
    [token_hash]
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  if (r.used_at) return null;
  const expiresAt = new Date(String(r.expires_at));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) return null;
  await pool.execute("update password_reset_tokens set used_at = ? where id = ? and used_at is null limit 1", [
    toMysqlDatetime(new Date()),
    Number(r.id),
  ]);
  return { user_id: Number(r.user_id) };
}

export async function createStockAiAnalysis(args: {
  user_id: number;
  symbol: string;
  effective_asof: string;
  freq: "1d" | "1w" | "1m";
  request_json: Record<string, unknown>;
  response_json: Record<string, unknown>;
}): Promise<StoredStockAiAnalysis> {
  const createdAt = new Date();
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [res] = await pool.execute<mysql.ResultSetHeader>(
      "insert into stock_ai_analyses(user_id, symbol, effective_asof, freq, request_json, response_json, created_at) values(?, ?, ?, ?, ?, ?, ?)",
      [
        args.user_id,
        args.symbol,
        args.effective_asof,
        args.freq,
        JSON.stringify(args.request_json),
        JSON.stringify(args.response_json),
        toMysqlDatetime(createdAt),
      ]
    );
    return {
      id: Number(res.insertId),
      user_id: args.user_id,
      symbol: args.symbol,
      effective_asof: args.effective_asof,
      freq: args.freq,
      request_json: args.request_json,
      response_json: args.response_json,
      created_at: toMysqlDatetime(createdAt),
    };
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const r = await pool.query(
      "insert into stock_ai_analyses(user_id, symbol, effective_asof, freq, request_json, response_json) values($1,$2,$3,$4,$5,$6) returning id, created_at",
      [args.user_id, args.symbol, args.effective_asof, args.freq, args.request_json, args.response_json]
    );
    const row = r.rows?.[0] as any;
    return {
      id: Number(row.id),
      user_id: args.user_id,
      symbol: args.symbol,
      effective_asof: args.effective_asof,
      freq: args.freq,
      request_json: args.request_json,
      response_json: args.response_json,
      created_at: new Date(row.created_at).toISOString(),
    };
  }
  // sqlite / file
  const db = ensureSqlite();
  const stmt = db.prepare(
    "insert into stock_ai_analyses(user_id, symbol, effective_asof, freq, request_json, response_json, created_at) values(?, ?, ?, ?, ?, ?, ?)"
  );
  stmt.run(
    args.user_id,
    args.symbol,
    args.effective_asof,
    args.freq,
    JSON.stringify(args.request_json),
    JSON.stringify(args.response_json),
    createdAt.toISOString()
  );
  const id = Number(db.prepare("select last_insert_rowid() as id").get()?.id || 0);
  return {
    id,
    user_id: args.user_id,
    symbol: args.symbol,
    effective_asof: args.effective_asof,
    freq: args.freq,
    request_json: args.request_json,
    response_json: args.response_json,
    created_at: createdAt.toISOString(),
  };
}

export async function getStockAiAnalysisById(id: number): Promise<StoredStockAiAnalysis | null> {
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "select id, user_id, symbol, effective_asof, freq, request_json, response_json, created_at from stock_ai_analyses where id = ? limit 1",
      [id]
    );
    const r = (rows as any[])[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      user_id: Number(r.user_id),
      symbol: String(r.symbol),
      effective_asof: formatMysqlDateLike(r.effective_asof),
      freq: String(r.freq) as any,
      request_json: typeof r.request_json === "string" ? JSON.parse(r.request_json) : (r.request_json ?? {}),
      response_json: typeof r.response_json === "string" ? JSON.parse(r.response_json) : (r.response_json ?? {}),
      created_at: formatMysqlDatetimeLike(r.created_at),
    };
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const r = await pool.query(
      "select id, user_id, symbol, effective_asof, freq, request_json, response_json, created_at from stock_ai_analyses where id = $1 limit 1",
      [id]
    );
    const row = r.rows?.[0] as any;
    if (!row) return null;
    return {
      id: Number(row.id),
      user_id: Number(row.user_id),
      symbol: String(row.symbol),
      effective_asof: String(row.effective_asof),
      freq: String(row.freq) as any,
      request_json: row.request_json ?? {},
      response_json: row.response_json ?? {},
      created_at: new Date(row.created_at).toISOString(),
    };
  }
  const db = ensureSqlite();
  const row = db
    .prepare(
      "select id, user_id, symbol, effective_asof, freq, request_json, response_json, created_at from stock_ai_analyses where id = ? limit 1"
    )
    .get(id) as any;
  if (!row) return null;
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    symbol: String(row.symbol),
    effective_asof: String(row.effective_asof),
    freq: String(row.freq) as any,
    request_json: JSON.parse(String(row.request_json || "{}")),
    response_json: JSON.parse(String(row.response_json || "{}")),
    created_at: String(row.created_at),
  };
}

export async function createStockAiMessage(args: {
  ai_analysis_id: number;
  role: "user" | "assistant";
  content: string;
  meta_json?: Record<string, unknown>;
}): Promise<StoredStockAiMessage> {
  const createdAt = new Date();
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [res] = await pool.execute<mysql.ResultSetHeader>(
      "insert into stock_ai_messages(ai_analysis_id, role, content, meta_json, created_at) values(?, ?, ?, ?, ?)",
      [
        args.ai_analysis_id,
        args.role,
        args.content,
        args.meta_json ? JSON.stringify(args.meta_json) : null,
        toMysqlDatetime(createdAt),
      ]
    );
    return {
      id: Number(res.insertId),
      ai_analysis_id: args.ai_analysis_id,
      role: args.role,
      content: args.content,
      meta_json: args.meta_json,
      created_at: toMysqlDatetime(createdAt),
    };
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const r = await pool.query(
      "insert into stock_ai_messages(ai_analysis_id, role, content, meta_json) values($1,$2,$3,$4) returning id, created_at",
      [args.ai_analysis_id, args.role, args.content, args.meta_json ?? null]
    );
    const row = r.rows?.[0] as any;
    return {
      id: Number(row.id),
      ai_analysis_id: args.ai_analysis_id,
      role: args.role,
      content: args.content,
      meta_json: args.meta_json,
      created_at: new Date(row.created_at).toISOString(),
    };
  }
  const db = ensureSqlite();
  const stmt = db.prepare(
    "insert into stock_ai_messages(ai_analysis_id, role, content, meta_json, created_at) values(?, ?, ?, ?, ?)"
  );
  stmt.run(
    args.ai_analysis_id,
    args.role,
    args.content,
    args.meta_json ? JSON.stringify(args.meta_json) : null,
    createdAt.toISOString()
  );
  const id = Number(db.prepare("select last_insert_rowid() as id").get()?.id || 0);
  return {
    id,
    ai_analysis_id: args.ai_analysis_id,
    role: args.role,
    content: args.content,
    meta_json: args.meta_json,
    created_at: createdAt.toISOString(),
  };
}

export async function listStockAiMessages(
  ai_analysis_id: number,
  limit = 20
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const lim = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 20;
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      // MySQL prepared statements can be picky about LIMIT placeholders in some setups; interpolate bounded integer.
      `select role, content from stock_ai_messages where ai_analysis_id = ? order by id desc limit ${lim}`,
      [ai_analysis_id]
    );
    const items = (rows as any[]).map((r) => ({ role: String(r.role) as any, content: String(r.content) }));
    return items.reverse();
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const r = await pool.query(
      "select role, content from stock_ai_messages where ai_analysis_id = $1 order by id desc limit $2",
      [ai_analysis_id, lim]
    );
    const items = (r.rows as any[]).map((x) => ({ role: String(x.role) as any, content: String(x.content) }));
    return items.reverse();
  }
  const db = ensureSqlite();
  const rows = db
    .prepare("select role, content from stock_ai_messages where ai_analysis_id = ? order by id desc limit ?")
    .all(ai_analysis_id, lim) as any[];
  const items = rows.map((r) => ({ role: String(r.role) as any, content: String(r.content) }));
  return items.reverse();
}

export async function saveChart(chart: StoredChart) {
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const createdAt = chart.created_at.includes("T") ? toMysqlDatetime(new Date(chart.created_at)) : chart.created_at;
    const userId = chart.user_id ?? null;
    const profileId = chart.profile_id ?? null;
    const payload = JSON.stringify(chart);
    await pool.execute(
      `insert into charts(chart_id, user_id, profile_id, payload, created_at)
       values(?, ?, ?, cast(? as json), ?)
       on duplicate key update
         user_id=values(user_id),
         profile_id=values(profile_id),
         payload=values(payload),
         created_at=values(created_at)`,
      [chart.chart_id, userId, profileId, payload, createdAt]
    );
    return;
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    await pool.query(
      `insert into charts(chart_id, payload, created_at) values($1, $2::jsonb, $3)
       on conflict (chart_id) do update set payload = excluded.payload, created_at = excluded.created_at`,
      [chart.chart_id, JSON.stringify(chart), chart.created_at]
    );
    return;
  }
  if (storageMode === "sqlite") {
    const db = ensureSqlite();
    db.prepare(
      `insert into charts(chart_id, payload, created_at) values(?, ?, ?)
       on conflict(chart_id) do update set payload=excluded.payload, created_at=excluded.created_at`
    ).run(chart.chart_id, JSON.stringify(chart), chart.created_at);
    return;
  }
  const db = readDb();
  db.charts.unshift(chart);
  db.charts = db.charts.slice(0, 5000);
  writeDb(db);
}

export async function getAiReadingCache(
  chartId: string,
  analystMode: string
): Promise<{ ai_text: string; provider: string } | undefined> {
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "select ai_text, provider from ai_reading_cache where chart_id = ? and analyst_mode = ? limit 1",
      [chartId, analystMode]
    );
    const row = rows?.[0] as any;
    return row ? { ai_text: String(row.ai_text), provider: String(row.provider) } : undefined;
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const rs = await pool.query<{ ai_text: string; provider: string }>(
      "select ai_text, provider from ai_reading_cache where chart_id = $1 and analyst_mode = $2 limit 1",
      [chartId, analystMode]
    );
    const row = rs.rows[0];
    return row ? { ai_text: row.ai_text, provider: row.provider } : undefined;
  }
  if (storageMode === "sqlite") {
    const db = ensureSqlite();
    const row = db
      .prepare("select ai_text, provider from ai_reading_cache where chart_id = ? and analyst_mode = ? limit 1")
      .get(chartId, analystMode) as { ai_text: string; provider: string } | undefined;
    return row ? { ai_text: row.ai_text, provider: row.provider } : undefined;
  }
  return fileModeAiCache.get(aiCacheKey(chartId, analystMode));
}

export async function saveAiReadingCache(
  chartId: string,
  analystMode: string,
  aiText: string,
  provider: string
): Promise<void> {
  const now = new Date().toISOString();
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    await pool.execute(
      `insert into ai_reading_cache(chart_id, analyst_mode, ai_text, provider, updated_at)
       values(?, ?, ?, ?, ?)
       on duplicate key update ai_text=values(ai_text), provider=values(provider), updated_at=values(updated_at)`,
      [chartId, analystMode, aiText, provider, now.replace("T", " ").replace("Z", "")]
    );
    return;
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    await pool.query(
      `insert into ai_reading_cache(chart_id, analyst_mode, ai_text, provider, updated_at)
       values($1, $2, $3, $4, now())
       on conflict (chart_id, analyst_mode) do update set
         ai_text = excluded.ai_text, provider = excluded.provider, updated_at = now()`,
      [chartId, analystMode, aiText, provider]
    );
    return;
  }
  if (storageMode === "sqlite") {
    const db = ensureSqlite();
    db.prepare(
      `insert into ai_reading_cache(chart_id, analyst_mode, ai_text, provider, updated_at)
       values(?, ?, ?, ?, ?)
       on conflict(chart_id, analyst_mode) do update set
         ai_text=excluded.ai_text, provider=excluded.provider, updated_at=excluded.updated_at`
    ).run(chartId, analystMode, aiText, provider, now);
    return;
  }
  fileModeAiCache.set(aiCacheKey(chartId, analystMode), { ai_text: aiText, provider });
}

export async function getChart(chartId: string): Promise<StoredChart | undefined> {
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "select payload from charts where chart_id = ? limit 1",
      [chartId]
    );
    const row = rows?.[0] as any;
    if (!row) return undefined;
    const payload = row.payload;
    if (typeof payload === "string") return JSON.parse(payload) as StoredChart;
    return payload as StoredChart;
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const rs = await pool.query<{ payload: StoredChart }>(
      "select payload from charts where chart_id = $1 limit 1",
      [chartId]
    );
    return rs.rows[0]?.payload;
  }
  if (storageMode === "sqlite") {
    const db = ensureSqlite();
    const row = db.prepare("select payload from charts where chart_id = ? limit 1").get(chartId) as
      | { payload: string }
      | undefined;
    return row ? (JSON.parse(row.payload) as StoredChart) : undefined;
  }
  const db = readDb();
  return db.charts.find((c) => c.chart_id === chartId);
}

export async function saveEvent(event: StoredEvent) {
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    await pool.execute(
      `insert into events(event_name, anon_id, session_id, user_id, profile_id, chart_id, report_id, ab_group, props, created_at)
       values(?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?)`,
      [
        event.event_name,
        event.anon_id,
        event.session_id,
        event.user_id ?? null,
        event.profile_id ?? null,
        event.chart_id ?? null,
        event.report_id ?? null,
        event.ab_group ?? null,
        JSON.stringify(event.props ?? {}),
        event.created_at.replace("T", " ").replace("Z", ""),
      ]
    );
    return;
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    await pool.query(
      `insert into events(event_name, anon_id, session_id, chart_id, report_id, ab_group, props, created_at)
       values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        event.event_name,
        event.anon_id,
        event.session_id,
        event.chart_id ?? null,
        event.report_id ?? null,
        event.ab_group ?? null,
        JSON.stringify(event.props ?? {}),
        event.created_at,
      ]
    );
    return;
  }
  if (storageMode === "sqlite") {
    const db = ensureSqlite();
    db.prepare(
      `insert into events(event_name, anon_id, session_id, chart_id, report_id, ab_group, props, created_at)
       values(?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.event_name,
      event.anon_id,
      event.session_id,
      event.chart_id ?? null,
      event.report_id ?? null,
      event.ab_group ?? null,
      JSON.stringify(event.props ?? {}),
      event.created_at
    );
    return;
  }
  const db = readDb();
  db.events.unshift(event);
  db.events = db.events.slice(0, 50000);
  writeDb(db);
}

export async function getMetrics() {
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [[chartsTotal]] = await pool.execute<mysql.RowDataPacket[]>("select count(*) as c from charts");
    const [[eventsTotal]] = await pool.execute<mysql.RowDataPacket[]>("select count(*) as c from events");
    const [[charts24h]] = await pool.execute<mysql.RowDataPacket[]>(
      "select count(*) as c from charts where created_at >= (now() - interval 1 day)"
    );
    const [[events24h]] = await pool.execute<mysql.RowDataPacket[]>(
      "select count(*) as c from events where created_at >= (now() - interval 1 day)"
    );
    const [[reportView]] = await pool.execute<mysql.RowDataPacket[]>(
      "select count(*) as c from events where created_at >= (now() - interval 1 day) and event_name='report_view'"
    );
    const [[shareSuccess]] = await pool.execute<mysql.RowDataPacket[]>(
      "select count(*) as c from events where created_at >= (now() - interval 1 day) and event_name='share_success'"
    );
    const get = (x: any) => Number(x?.c ?? 0);
    return {
      mode: storageMode,
      charts_total: get(chartsTotal),
      events_total: get(eventsTotal),
      charts_24h: get(charts24h),
      events_24h: get(events24h),
      report_view_24h: get(reportView),
      share_success_24h: get(shareSuccess),
    };
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const [chartsTotal, eventsTotal, charts24h, events24h, reportView, shareSuccess] = await Promise.all([
      pool.query("select count(*)::int as c from charts"),
      pool.query("select count(*)::int as c from events"),
      pool.query("select count(*)::int as c from charts where created_at >= now() - interval '24 hours'"),
      pool.query("select count(*)::int as c from events where created_at >= now() - interval '24 hours'"),
      pool.query("select count(*)::int as c from events where created_at >= now() - interval '24 hours' and event_name='report_view'"),
      pool.query("select count(*)::int as c from events where created_at >= now() - interval '24 hours' and event_name='share_success'"),
    ]);
    return {
      mode: storageMode,
      charts_total: chartsTotal.rows[0]?.c ?? 0,
      events_total: eventsTotal.rows[0]?.c ?? 0,
      charts_24h: charts24h.rows[0]?.c ?? 0,
      events_24h: events24h.rows[0]?.c ?? 0,
      report_view_24h: reportView.rows[0]?.c ?? 0,
      share_success_24h: shareSuccess.rows[0]?.c ?? 0,
    };
  }
  if (storageMode === "sqlite") {
    const db = ensureSqlite();
    const c = (sql: string) => (db.prepare(sql).get() as { c: number }).c ?? 0;
    return {
      mode: storageMode,
      charts_total: c("select count(*) as c from charts"),
      events_total: c("select count(*) as c from events"),
      charts_24h: c("select count(*) as c from charts where datetime(created_at) >= datetime('now','-1 day')"),
      events_24h: c("select count(*) as c from events where datetime(created_at) >= datetime('now','-1 day')"),
      report_view_24h: c("select count(*) as c from events where datetime(created_at) >= datetime('now','-1 day') and event_name='report_view'"),
      share_success_24h: c("select count(*) as c from events where datetime(created_at) >= datetime('now','-1 day') and event_name='share_success'"),
    };
  }
  const db = readDb();
  const since = Date.now() - 24 * 3600 * 1000;
  const events24h = db.events.filter((e) => new Date(e.created_at).getTime() >= since);
  const chart24h = db.charts.filter((c) => new Date(c.created_at).getTime() >= since);
  const count = (name: string) => events24h.filter((e) => e.event_name === name).length;
  return {
    mode: storageMode,
    charts_total: db.charts.length,
    events_total: db.events.length,
    charts_24h: chart24h.length,
    events_24h: events24h.length,
    report_view_24h: count("report_view"),
    share_success_24h: count("share_success"),
  };
}

export function getStorageMode() {
  return storageMode;
}

export async function listChartsByUser(
  userId: number,
  limit = 30
): Promise<Array<{ chart_id: string; created_at: string; summary: string }>> {
  const take = Math.max(1, Math.min(100, Math.floor(limit || 30)));
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "select chart_id, created_at, payload from charts where user_id = ? order by created_at desc limit ?",
      [userId, take]
    );
    return (rows as any[]).map((r) => {
      const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
      const summary = String(payload?.user_readable?.one_line || payload?.basic_summary || "").slice(0, 120);
      return { chart_id: String(r.chart_id), created_at: String(r.created_at), summary };
    });
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    // charts payload is jsonb; user_id is not stored in PG in this version
    throw new Error("list_charts_requires_mysql");
  }
  if (storageMode === "sqlite") {
    throw new Error("list_charts_requires_mysql");
  }
  throw new Error("list_charts_requires_mysql");
}

export async function listProfilesByUser(userId: number): Promise<StoredProfile[]> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysql();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "select id, user_id, name, meta, created_at, updated_at from profiles where user_id = ? order by id desc",
    [userId]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    name: String(r.name),
    meta: parseProfileMeta(r.meta),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

export async function createProfile(
  userId: number,
  name: string,
  meta?: Record<string, unknown>
): Promise<StoredProfile> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysql();
  const now = new Date().toISOString().replace("T", " ").replace("Z", "");
  const n = name.trim().slice(0, 64);
  if (!n) throw new Error("profile_name_required");
  try {
    const [res] = await pool.execute<mysql.ResultSetHeader>(
      "insert into profiles(user_id, name, meta, created_at, updated_at) values(?, ?, ?, ?, ?)",
      [userId, n, JSON.stringify(meta ?? {}), now, now]
    );
    return { id: Number(res.insertId), user_id: userId, name: n, meta: meta ?? {}, created_at: now, updated_at: now };
  } catch (e: any) {
    const msg = String(e?.message || "");
    // Duplicate name per user: uniq_profiles_user_name (user_id, name)
    if (msg.includes("Duplicate") || msg.includes("duplicate") || msg.includes("uniq_profiles_user_name")) {
      throw new Error("profile_name_taken");
    }
    throw e;
  }
}

export async function deleteProfile(userId: number, profileId: number): Promise<void> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysql();
  // prevent deleting profile that still has charts
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "select count(*) as c from charts where user_id = ? and profile_id = ?",
    [userId, profileId]
  );
  const c = Number((rows as any[])[0]?.c ?? 0);
  if (c > 0) throw new Error("profile_has_charts");
  await pool.execute("delete from profiles where user_id = ? and id = ? limit 1", [userId, profileId]);
}

export async function ensureDefaultProfile(userId: number): Promise<number> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysql();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "select id from profiles where user_id = ? order by id asc limit 1",
    [userId]
  );
  const got = (rows as any[])[0]?.id;
  if (got) return Number(got);
  const p = await createProfile(userId, "我", {});
  // best-effort backfill: assign existing charts without profile_id
  await pool.execute("update charts set profile_id = ? where user_id = ? and profile_id is null", [p.id, userId]);
  return p.id;
}

export async function getProfileById(userId: number, profileId: number): Promise<StoredProfile | undefined> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysql();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "select id, user_id, name, meta, created_at, updated_at from profiles where user_id = ? and id = ? limit 1",
    [userId, profileId]
  );
  const r = (rows as any[])[0];
  if (!r) return undefined;
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    name: String(r.name),
    meta: parseProfileMeta(r.meta),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export async function updateProfile(
  userId: number,
  profileId: number,
  patch: { name?: string; meta?: Record<string, unknown> }
): Promise<StoredProfile> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysql();
  const now = new Date().toISOString().replace("T", " ").replace("Z", "");
  const existing = await getProfileById(userId, profileId);
  if (!existing) throw new Error("profile_not_found");
  const nextName = (patch.name ?? existing.name).trim().slice(0, 64);
  if (!nextName) throw new Error("profile_name_required");
  const nextMeta = patch.meta ?? (existing.meta ?? {});
  try {
    await pool.execute("update profiles set name = ?, meta = ?, updated_at = ? where user_id = ? and id = ? limit 1", [
      nextName,
      JSON.stringify(nextMeta),
      now,
      userId,
      profileId,
    ]);
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("Duplicate") || msg.includes("duplicate") || msg.includes("uniq_profiles_user_name")) {
      throw new Error("profile_name_taken");
    }
    throw e;
  }
  return { ...existing, name: nextName, meta: nextMeta, updated_at: now };
}

export async function listChartsByProfile(
  userId: number,
  profileId: number,
  limit = 30
): Promise<Array<{ chart_id: string; created_at: string; summary: string }>> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysql();
  const take = Math.max(1, Math.min(100, Math.floor(limit || 30)));
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "select chart_id, created_at, payload from charts where user_id = ? and profile_id = ? order by created_at desc limit ?",
    [userId, profileId, take]
  );
  return (rows as any[]).map((r) => {
    const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    const summary = String(payload?.user_readable?.one_line || payload?.basic_summary || "").slice(0, 120);
    return { chart_id: String(r.chart_id), created_at: String(r.created_at), summary };
  });
}

export async function getLatestChartByProfile(userId: number, profileId: number): Promise<StoredChart | undefined> {
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "select payload from charts where user_id = ? and profile_id = ? order by created_at desc limit 1",
      [userId, profileId]
    );
    const r = (rows as any[])[0];
    if (!r) return undefined;
    const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    return payload as StoredChart;
  }
  if (storageMode === "postgres") {
    const pool = await ensurePg();
    const rs = await pool.query<{ payload: any }>(
      "select payload from charts where user_id = $1 and profile_id = $2 order by created_at desc limit 1",
      [userId, profileId]
    );
    const row = rs.rows[0];
    if (!row) return undefined;
    return (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as StoredChart;
  }
  if (storageMode === "sqlite") {
    const db = ensureSqlite();
    const row = db
      .prepare("select payload from charts where user_id = ? and profile_id = ? order by created_at desc limit 1")
      .get(userId, profileId) as { payload: any } | undefined;
    if (!row) return undefined;
    return (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as StoredChart;
  }
  const db = readDb();
  const rows = (db.charts || []).filter((c) => c.user_id === userId && c.profile_id === profileId);
  if (!rows.length) return undefined;
  return rows
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 1)[0];
}

export async function getHepanReportById(userId: number, reportId: number): Promise<StoredHepanReport | undefined> {
  if (storageMode !== "mysql") throw new Error("hepan_requires_mysql");
  const pool = await ensureMysql();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "select id, user_id, profile_id_a, profile_id_b, profile_name_a, profile_name_b, payload, ai_text, provider, created_at, updated_at from hepan_reports where user_id = ? and id = ? limit 1",
    [userId, reportId]
  );
  const r = (rows as any[])[0];
  if (!r) return undefined;
  const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    profile_id_a: Number(r.profile_id_a),
    profile_id_b: Number(r.profile_id_b),
    profile_name_a: r.profile_name_a ? String(r.profile_name_a) : undefined,
    profile_name_b: r.profile_name_b ? String(r.profile_name_b) : undefined,
    payload: payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
    ai_text: String(r.ai_text || ""),
    provider: String(r.provider || ""),
    created_at: formatMysqlDatetimeLike(r.created_at),
    updated_at: formatMysqlDatetimeLike(r.updated_at),
  };
}

export async function getHepanReportCache(
  userId: number,
  profileIdA: number,
  profileIdB: number
): Promise<StoredHepanReport | undefined> {
  if (storageMode !== "mysql") throw new Error("hepan_requires_mysql");
  const pool = await ensureMysql();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "select id, user_id, profile_id_a, profile_id_b, profile_name_a, profile_name_b, payload, ai_text, provider, created_at, updated_at from hepan_reports where user_id = ? and profile_id_a = ? and profile_id_b = ? limit 1",
    [userId, profileIdA, profileIdB]
  );
  const r = (rows as any[])[0];
  if (!r) return undefined;
  const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    profile_id_a: Number(r.profile_id_a),
    profile_id_b: Number(r.profile_id_b),
    profile_name_a: r.profile_name_a ? String(r.profile_name_a) : undefined,
    profile_name_b: r.profile_name_b ? String(r.profile_name_b) : undefined,
    payload: payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
    ai_text: String(r.ai_text || ""),
    provider: String(r.provider || ""),
    created_at: formatMysqlDatetimeLike(r.created_at),
    updated_at: formatMysqlDatetimeLike(r.updated_at),
  };
}

export async function upsertHepanReport(input: {
  user_id: number;
  profile_id_a: number;
  profile_id_b: number;
  profile_name_a?: string;
  profile_name_b?: string;
  payload: Record<string, unknown>;
  ai_text: string;
  provider: string;
}): Promise<StoredHepanReport> {
  if (storageMode !== "mysql") throw new Error("hepan_requires_mysql");
  const pool = await ensureMysql();
  const now = new Date().toISOString().replace("T", " ").replace("Z", "");
  await pool.execute(
    `insert into hepan_reports(user_id, profile_id_a, profile_id_b, profile_name_a, profile_name_b, payload, ai_text, provider, created_at, updated_at)
     values(?, ?, ?, ?, ?, cast(? as json), ?, ?, ?, ?)
     on duplicate key update
       profile_name_a=values(profile_name_a),
       profile_name_b=values(profile_name_b),
       payload=values(payload),
       ai_text=values(ai_text),
       provider=values(provider),
       updated_at=values(updated_at)`,
    [
      input.user_id,
      input.profile_id_a,
      input.profile_id_b,
      input.profile_name_a ? String(input.profile_name_a).slice(0, 64) : null,
      input.profile_name_b ? String(input.profile_name_b).slice(0, 64) : null,
      JSON.stringify(input.payload ?? {}),
      input.ai_text || "",
      input.provider || "",
      now,
      now,
    ]
  );
  const cached = await getHepanReportCache(input.user_id, input.profile_id_a, input.profile_id_b);
  if (!cached) throw new Error("hepan_upsert_failed");
  return cached;
}

export async function listHepanReportsByUser(
  userId: number,
  limit = 30
): Promise<Array<{ id: number; profile_name_a: string; profile_name_b: string; updated_at: string }>> {
  if (storageMode !== "mysql") throw new Error("hepan_requires_mysql");
  const pool = await ensureMysql();
  const take = Math.max(1, Math.min(100, Math.floor(limit || 30)));
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `select id, profile_name_a, profile_name_b, updated_at
     from hepan_reports
     where user_id = ?
     order by updated_at desc
     limit ${take}`,
    [userId]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    profile_name_a: String(r.profile_name_a || "A"),
    profile_name_b: String(r.profile_name_b || "B"),
    updated_at: formatMysqlDatetimeLike(r.updated_at),
  }));
}

export async function deleteHepanReportById(userId: number, reportId: number): Promise<boolean> {
  if (storageMode !== "mysql") throw new Error("hepan_requires_mysql");
  const pool = await ensureMysql();
  const [res] = await pool.execute<mysql.ResultSetHeader>(
    "delete from hepan_reports where user_id = ? and id = ? limit 1",
    [userId, reportId]
  );
  return Number((res as any)?.affectedRows || 0) > 0;
}

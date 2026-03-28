import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
import type { BirthMeta } from "./baziExtendedMeta.js";

export type StoredChart = {
  chart_id: string;
  created_at: string;
  /** 0 女 1 男，排盘时写入，供解读提示词使用 */
  gender?: 0 | 1;
  /** 用户填写的出生地文案（省市区拼接等），用于分享卡与展示 */
  birth_location?: string;
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
  chart_id?: string;
  report_id?: string;
  ab_group?: "A" | "B";
  props?: Record<string, unknown>;
  created_at: string;
};

type DbShape = {
  charts: StoredChart[];
  events: StoredEvent[];
};

const dataDir = path.resolve(process.cwd(), "data");
const dbFile = path.join(dataDir, "db.json");
const sqliteFile = path.join(dataDir, "app.db");
const databaseUrl = process.env.DATABASE_URL;
const configuredMode = process.env.STORAGE_MODE;
const storageMode =
  configuredMode === "file" || configuredMode === "sqlite" || configuredMode === "postgres"
    ? configuredMode
    : databaseUrl
      ? "postgres"
      : "sqlite";
let pgPool: Pool | null = null;
let pgReady = false;
let sqliteDb: DatabaseSync | null = null;
let sqliteReady = false;

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
    `);
    pgReady = true;
  }
  return pgPool;
}

export async function saveChart(chart: StoredChart) {
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

export async function getChart(chartId: string): Promise<StoredChart | undefined> {
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

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

export type StoredProfile = {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

type DbShape = {
  charts: StoredChart[];
  events: StoredEvent[];
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

/** file 存储模式下的灵犀缓存（进程内，重启清空） */
const fileModeAiCache = new Map<string, { ai_text: string; provider: string }>();
function aiCacheKey(chartId: string, analystMode: string) {
  return `${chartId}\0${analystMode}`;
}

async function ensureMysql(): Promise<mysql.Pool> {
  if (!mysqlUrl) throw new Error("MYSQL_URL_NOT_SET");
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      uri: mysqlUrl,
      connectionLimit: 10,
      // allow big JSON payloads for charts
      supportBigNumbers: true,
    });
  }
  if (!mysqlReady) {
    const pool = mysqlPool;
    await pool.execute(`
      create table if not exists profiles (
        id bigint primary key auto_increment,
        user_id bigint not null,
        name varchar(64) not null,
        created_at datetime not null,
        updated_at datetime not null,
        unique key uniq_profiles_user_name (user_id, name),
        index idx_profiles_user (user_id)
      );
    `);
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
    mysqlReady = true;
  }
  return mysqlPool!;
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
    `);
    pgReady = true;
  }
  return pgPool;
}

export async function saveChart(chart: StoredChart) {
  if (storageMode === "mysql") {
    const pool = await ensureMysql();
    const createdAt = chart.created_at;
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
    // charts payload is jsonb; user_id is not stored in PG in this MVP
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
    "select id, user_id, name, created_at, updated_at from profiles where user_id = ? order by id desc",
    [userId]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    name: String(r.name),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

export async function createProfile(userId: number, name: string): Promise<StoredProfile> {
  if (storageMode !== "mysql") throw new Error("profiles_requires_mysql");
  const pool = await ensureMysql();
  const now = new Date().toISOString().replace("T", " ").replace("Z", "");
  const n = name.trim().slice(0, 64);
  if (!n) throw new Error("profile_name_required");
  const [res] = await pool.execute<mysql.ResultSetHeader>(
    "insert into profiles(user_id, name, created_at, updated_at) values(?, ?, ?, ?)",
    [userId, n, now, now]
  );
  return { id: Number(res.insertId), user_id: userId, name: n, created_at: now, updated_at: now };
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
  const p = await createProfile(userId, "我");
  // best-effort backfill: assign existing charts without profile_id
  await pool.execute("update charts set profile_id = ? where user_id = ? and profile_id is null", [p.id, userId]);
  return p.id;
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

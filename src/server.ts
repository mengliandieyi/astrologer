import dotenv from "dotenv";
// In production we rely on project `.env` as the source of truth.
// PM2 may inject env vars first; without override, dotenv will NOT replace them.
dotenv.config({ override: true });
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignAbGroup } from "./lib/abTest.js";
import { getProReportDynamic, trackEvent } from "./api/mvpHandlers.js";
import type { BirthMeta } from "./lib/baziExtendedMeta.js";
import { calculateBaziFromSolar } from "./lib/baziCalculator.js";
import { generateAiReading } from "./lib/aiClient.js";
import { registerStocksRoutes } from "./api/stocksHandlers.js";
import { registerTravelRoutes } from "./api/travelHandlers.js";
import { enrichChartFortuneCycles } from "./lib/enrichChartFortunes.js";
import {
  createUser,
  createUserWithEmail,
  getUserById,
  getUserByEmail,
  getUserByUsername,
  signAuthToken,
  setUserPasswordById,
  validateEmail,
  validatePassword,
  validateUsername,
  verifyAuthToken,
  verifyPassword,
} from "./lib/auth.js";
import {
  createProfile,
  consumePasswordResetToken,
  createPasswordResetToken,
  deleteProfile,
  ensureDefaultProfile,
  getAiReadingCache,
  getProfileById,
  getLatestChartByProfile,
  getChart,
  getMetrics,
  getStorageMode,
  getHepanReportById,
  getHepanReportCache,
  deleteHepanReportById,
  listChartsByProfile,
  listChartsByUser,
  listHepanReportsByUser,
  listProfilesByUser,
  saveAiReadingCache,
  saveChart,
  upsertHepanReport,
  updateProfile,
} from "./lib/store.js";
import { sendPasswordResetEmail, sendTestEmail } from "./lib/mailer.js";

type ChartRecord = {
  chart_id: string;
  /** 0 女 1 男 */
  gender?: 0 | 1;
  /** 排盘请求中的出生地（与真太阳时校正用 location 一致） */
  birth_location?: string;
  birth_date?: string;
  birth_time?: string;
  birth_timezone?: string;
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
      love?: string;
      wealth?: string;
      career?: string;
      health?: string;
      summary?: string;
      shen_sha?: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
    }>;
    liu_nian_preview: Array<{
      year: number;
      gan_zhi: string;
      love: string;
      wealth: string;
      career: string;
      health?: string;
      summary: string;
      shen_sha?: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
    }>;
    liu_yue_preview?: Array<{
      year: number;
      month: number;
      gan_zhi: string;
      love: string;
      wealth: string;
      career: string;
      health?: string;
      summary: string;
      shen_sha?: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
    }>;
  };
  shen_sha_by_pillar?: {
    year: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
    month: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
    day: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
    hour: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
  };
  shen_sha?: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis: string }>;
  birth_meta?: BirthMeta;
  user_readable?: {
    one_line: string;
    actions: string[];
    cautions: string[];
    liu_nian_tips: Array<{ year: number; label: string; tip: string }>;
  };
};

const app = express();
app.use(express.json({ limit: "1mb" }));
app.set("trust proxy", true);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const webDistDir = path.resolve(__dirname, "../web/dist");
const spaIndexPath = path.join(webDistDir, "index.html");
const spaBuilt = fs.existsSync(spaIndexPath);

/** React SPA（web/dist）：与 Vite 开发环境一致，主题/CSS 在 TSX 中 */
if (spaBuilt) {
  app.use(express.static(webDistDir, { index: false }));
}

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  const startAt = Date.now();
  res.setHeader("x-request-id", requestId);
  res.on("finish", () => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "info",
        type: "request_log",
        request_id: requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - startAt,
        ip: req.ip || req.socket.remoteAddress || "unknown",
      })
    );
  });
  next();
});

function sendSpaIndex(res: express.Response) {
  res.sendFile(spaIndexPath);
}

app.get("/", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/bazi", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.sendFile(path.join(publicDir, "bazi.html"));
});

app.get("/stocks", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.sendFile(path.join(publicDir, "stocks.html"));
});

app.get("/xinglv", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.sendFile(path.join(publicDir, "travel.html"));
});

app.get("/xinglv/recommend", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.sendFile(path.join(publicDir, "travel.html"));
});

app.get("/xinglv/plan", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.sendFile(path.join(publicDir, "travel.html"));
});

app.get("/comic", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.sendFile(path.join(publicDir, "comic.html"));
});

// SPA route fallbacks (production): serve index.html for client-side routes.
if (spaBuilt) {
  app.get(
    [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/my/charts",
      "/my/profiles",
      "/hepan",
      "/my/hepan",
    ],
    (_req, res) => sendSpaIndex(res)
  );
}

app.get("/workspace", (_req, res) => {
  res.redirect(302, "/");
});

app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    storage_mode: getStorageMode(),
    git_sha:
      process.env.GIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.RENDER_GIT_COMMIT ||
      process.env.HEROKU_SLUG_COMMIT ||
      null,
    uptime_sec: Math.floor(process.uptime()),
    now: new Date().toISOString(),
  });
});

// Lightweight rate limit for public APIs.
const rate = new Map<string, { count: number; resetAt: number }>();
app.use("/api", (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const slot = rate.get(ip);
  if (!slot || now > slot.resetAt) {
    rate.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  slot.count += 1;
  if (slot.count > 120) return res.status(429).json({ error: "too_many_requests" });
  return next();
});

function parseCookies(req: express.Request): Record<string, string> {
  const raw = req.header("cookie") || "";
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("=") || "");
  }
  return out;
}

function cookieSecure(req: express.Request): boolean {
  const xf = String(req.header("x-forwarded-proto") || "").toLowerCase();
  return Boolean(req.secure || xf === "https");
}

function setAuthCookie(res: express.Response, token: string, secure: boolean) {
  const attrs = [
    `auth_token=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${14 * 24 * 3600}`,
  ];
  if (secure) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearAuthCookie(res: express.Response, secure: boolean) {
  const attrs = ["auth_token=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function getAuthedUserId(req: express.Request): number | null {
  const token = parseCookies(req).auth_token || "";
  const payload = token ? verifyAuthToken(token) : null;
  return payload?.uid ?? null;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const uid = getAuthedUserId(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  (req as any).userId = uid;
  return next();
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next();
  const got = req.header("x-admin-token") || "";
  if (got !== token) return res.status(401).json({ error: "unauthorized" });
  return next();
}

app.get("/api/auth/me", async (req, res) => {
  const uid = getAuthedUserId(req);
  if (!uid) return res.json({ logged_in: false });
  try {
    const u = await getUserById(uid);
    if (!u) return res.json({ logged_in: false });
    return res.json({ logged_in: true, user: u });
  } catch (e: any) {
    // DB/network issues should not crash the server; treat as transient.
    return res.status(503).json({ error: "auth_backend_unavailable", logged_in: false, detail: String(e?.message || e) });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = validateUsername(String(req.body?.username ?? ""));
    const email = validateEmail(String(req.body?.email ?? ""));
    const password = validatePassword(String(req.body?.password ?? ""));
    const u = await createUserWithEmail(username, email, password);
    const token = signAuthToken(u.id);
    setAuthCookie(res, token, cookieSecure(req));
    return res.json({ user: { id: u.id, username: u.username } });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

function hashHex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function withTimeout<T>(p: Promise<T>, ms: number, code = "timeout"): Promise<T> {
  let t: any = null;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(Object.assign(new Error(code), { code })), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

function publicOrigin(req: express.Request): string {
  // respect reverse proxy headers
  const xf = String(req.header("x-forwarded-proto") || "").toLowerCase();
  const proto = xf || (req.secure ? "https" : "http");
  const host = String(req.get("host") || "").trim();
  return `${proto}://${host}`;
}

app.post("/api/auth/forgot-password", async (req, res) => {
  // Always return ok to avoid account enumeration
  try {
    const email = validateEmail(String(req.body?.email ?? ""));
    const user = await getUserByEmail(email);
    if (!user) return res.json({ ok: true });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashHex(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    await createPasswordResetToken({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt });

    const origin = publicOrigin(req);
    const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendPasswordResetEmail(email, resetUrl);
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: true });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const tokenRaw = String(req.body?.token ?? "").trim();
    if (!tokenRaw) return res.status(400).json({ error: "token_required" });
    const password = validatePassword(String(req.body?.password ?? ""));
    const tokenHash = hashHex(tokenRaw);
    const consumed = await consumePasswordResetToken(tokenHash);
    if (!consumed) return res.status(400).json({ error: "token_invalid_or_expired" });
    await setUserPasswordById(consumed.user_id, password);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const identRaw = String(req.body?.username ?? "").trim();
    if (!identRaw) return res.status(400).json({ error: "username_required" });
    const password = validatePassword(String(req.body?.password ?? ""));

    // Login by either email or username.
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identRaw);
    if (isEmail) {
      const email = String(identRaw).toLowerCase();
      const u0 = await withTimeout(getUserByEmail(email), 7000, "auth_db_timeout");
      if (!u0) return res.status(401).json({ error: "invalid_credentials" });
      const u = await withTimeout(getUserByUsername(u0.username), 7000, "auth_db_timeout");
      if (!u) return res.status(401).json({ error: "invalid_credentials" });
      const ok = await verifyPassword(password, u.password_hash);
      if (!ok) return res.status(401).json({ error: "invalid_credentials" });
      const token = signAuthToken(u.id);
      setAuthCookie(res, token, cookieSecure(req));
      return res.json({ user: { id: u.id, username: u.username } });
    }

    const username = validateUsername(identRaw);
    const u = await withTimeout(getUserByUsername(username), 7000, "auth_db_timeout");
    if (!u) return res.status(401).json({ error: "invalid_credentials" });
    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    const token = signAuthToken(u.id);
    setAuthCookie(res, token, cookieSecure(req));
    return res.json({ user: { id: u.id, username: u.username } });
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    // Surface transient DB/network errors as 503 so frontend doesn't spin forever.
    if (
      /EADDRNOTAVAIL|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|PROTOCOL_CONNECTION_LOST/i.test(msg) ||
      String((e as any)?.code || "").toUpperCase().includes("EADDRNOTAVAIL")
    ) {
      return res.status(503).json({ error: "auth_backend_unavailable" });
    }
    return res.status(400).json({ error: msg });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res, cookieSecure(req));
  return res.status(204).send();
});

// Stocks / 资研参详
registerStocksRoutes(app, requireAuth);

// Travel / 行旅筹划
registerTravelRoutes(app);

app.get("/api/me/charts", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  const limit = Number(req.query.limit ?? 30);
  try {
    const rows = await listChartsByUser(uid, Number.isFinite(limit) ? limit : 30);
    return res.json({ charts: rows });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/api/me/profiles", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  try {
    const profiles = await listProfilesByUser(uid);
    return res.json({ profiles });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/api/me/profiles", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  try {
    const name = String(req.body?.name ?? "");
    const metaRaw = req.body?.meta;
    const meta =
      metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw) ? (metaRaw as Record<string, unknown>) : {};
    const p = await createProfile(uid, name, meta);
    return res.json({ profile: p });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/api/me/profiles/:profileId", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  const pid = Number(req.params.profileId ?? "");
  if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ error: "profile_id_required" });
  try {
    const p = await getProfileById(uid, Math.floor(pid));
    if (!p) return res.status(404).json({ error: "profile_not_found" });
    return res.json({ profile: p });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.patch("/api/me/profiles/:profileId", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  const pid = Number(req.params.profileId ?? "");
  if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ error: "profile_id_required" });
  try {
    const nameRaw = req.body?.name;
    const metaRaw = req.body?.meta;
    const patch: { name?: string; meta?: Record<string, unknown> } = {};
    if (typeof nameRaw === "string") patch.name = nameRaw;
    if (metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)) patch.meta = metaRaw as Record<string, unknown>;
    const p = await updateProfile(uid, Math.floor(pid), patch);
    return res.json({ profile: p });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.delete("/api/me/profiles/:profileId", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  const pid = Number(req.params.profileId ?? "");
  if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ error: "profile_id_required" });
  try {
    await deleteProfile(uid, pid);
    return res.status(204).send();
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/api/me/profiles/:profileId/charts", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  const pid = Number(req.params.profileId ?? "");
  const limit = Number(req.query.limit ?? 30);
  if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ error: "profile_id_required" });
  try {
    const rows = await listChartsByProfile(uid, pid, Number.isFinite(limit) ? limit : 30);
    return res.json({ charts: rows });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

function pickString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

function pickLocation(meta: Record<string, unknown>): string {
  const direct = pickString(meta, "birth_location");
  if (direct) return direct;
  const r = meta["birth_region"];
  if (!r || typeof r !== "object") return "";
  const province = typeof (r as any).province === "string" ? String((r as any).province).trim() : "";
  const city = typeof (r as any).city === "string" ? String((r as any).city).trim() : "";
  const district = typeof (r as any).district === "string" ? String((r as any).district).trim() : "";
  return `${province}${city}${district}`.trim();
}

function pickGender(meta: Record<string, unknown>): 0 | 1 {
  const v = meta["gender"];
  if (v === 0 || v === 1) return v;
  const n = Number(v);
  return n === 0 ? 0 : 1;
}

app.post("/api/bazi/calculate", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const profileSourceEnabled = String(process.env.PROFILE_AS_SOURCE ?? "true").toLowerCase() !== "false";
  let calendar_type = body.calendar_type === "lunar" ? "lunar" : "solar";
  let lunar_leap_month = Boolean((body as any)?.birth_lunar_leap);
  const refresh = Boolean((body as any)?.refresh);

  try {
    const userId = (req as any).userId as number;
    const pidRaw = Number(body.profile_id ?? "");
    const profileId =
      Number.isFinite(pidRaw) && pidRaw > 0 ? Math.floor(pidRaw) : await ensureDefaultProfile(userId);
    let birth_date = "";
    let birth_time = "";
    let timezone = "";
    let location = "";
    let gender: 0 | 1 = 1;
    let profileUpdatedAt = "";

    if (profileSourceEnabled) {
      const p = await getProfileById(userId, profileId);
      if (!p) return res.status(404).json({ error: "profile_not_found" });
      profileUpdatedAt = String(p.updated_at || "");
      const meta = (p.meta ?? {}) as Record<string, unknown>;
      birth_date = pickString(meta, "birth_date");
      birth_time = pickString(meta, "birth_time");
      timezone = pickString(meta, "birth_timezone") || "Asia/Shanghai";
      location = pickLocation(meta);
      gender = pickGender(meta);
      const calRaw = pickString(meta, "birth_calendar_type").toLowerCase();
      calendar_type = calRaw === "lunar" ? "lunar" : "solar";
      lunar_leap_month = Boolean((meta as any)?.birth_lunar_leap);

      if (!refresh) {
        const latest = await getLatestChartByProfile(userId, profileId);
        if (latest?.created_at && profileUpdatedAt) {
          const c = String(latest.created_at);
          const p = String(profileUpdatedAt);
          const canStringCompare =
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(c) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(p);
          const ok = canStringCompare ? c >= p : new Date(c).getTime() >= new Date(p).getTime();
          if (ok) {
            return res.json({ ...(latest as any), from_cache: true });
          }
        }
      }
    } else {
      // legacy mode: accept direct payload (allows quick rollback)
      birth_date = String(body.birth_date ?? "");
      birth_time = String(body.birth_time ?? "");
      timezone = String(body.timezone ?? "");
      location = String(body.location ?? "");
      gender = Number(body.gender) === 0 ? 0 : 1;
      lunar_leap_month = Boolean((body as any)?.birth_lunar_leap);
    }

    if (!birth_date || !birth_time || !timezone || !location) {
      return res.status(400).json({ error: profileSourceEnabled ? "profile_incomplete" : "missing_required_fields" });
    }
    if (!isValidDateString(String(birth_date)) || !isValidTimeString(String(birth_time))) {
      return res.status(400).json({ error: "invalid_birth_datetime_format" });
    }
    if (!isValidTimezone(String(timezone))) {
      return res.status(400).json({ error: "invalid_timezone" });
    }
    if (!isValidLocationInput(String(location))) {
      return res.status(400).json({ error: "invalid_location" });
    }

    const chartId = crypto.randomUUID();
    const g = gender;
    const calc = calculateBaziFromSolar(
      String(birth_date),
      String(birth_time),
      String(location),
      calendar_type === "lunar" ? "lunar" : "solar",
      g,
      String(timezone),
      lunar_leap_month
    );
    const output: ChartRecord = {
      chart_id: chartId,
      gender: g,
      birth_location: String(location).trim(),
      birth_date: String(birth_date),
      birth_time: String(birth_time),
      birth_timezone: String(timezone),
      basic_summary: calc.basic_summary,
      pillars: calc.pillars,
      five_elements: calc.five_elements,
      true_solar_time: calc.true_solar_time,
      jie_qi: calc.jie_qi,
      ten_gods: calc.ten_gods,
      ge_ju: calc.ge_ju,
      jie_qi_window: calc.jie_qi_window,
      day_master: calc.day_master,
      calendar_meta: calc.calendar_meta,
      fortune_cycles: calc.fortune_cycles,
      shen_sha_by_pillar: calc.shen_sha_by_pillar,
      shen_sha: calc.shen_sha,
      birth_meta: calc.birth_meta,
      user_readable: calc.user_readable,
    };
    await saveChart({
      ...output,
      created_at: new Date().toISOString(),
      user_id: userId,
      profile_id: profileId,
    });
    return res.json({ ...output, from_cache: false });
  } catch (e: any) {
    // Provide detail for debugging; frontend will humanize.
    const detail = String(e?.message || "");
    return res.status(422).json({ error: "invalid_birth_datetime", detail: detail.slice(0, 200) });
  }
});

app.get("/api/me/hepan", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  const limit = Number(req.query.limit ?? 30);
  try {
    const items = await listHepanReportsByUser(uid, Number.isFinite(limit) ? limit : 30);
    return res.json({ reports: items });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/api/hepan/:reportId", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  const rid = Number(req.params.reportId ?? "");
  if (!Number.isFinite(rid) || rid <= 0) return res.status(400).json({ error: "report_id_required" });
  try {
    const out = await getHepanReportById(uid, Math.floor(rid));
    if (!out) return res.status(404).json({ error: "hepan_not_found" });
    return res.json({ report: out });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.delete("/api/hepan/:reportId", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  const rid = Number(req.params.reportId ?? "");
  if (!Number.isFinite(rid) || rid <= 0) return res.status(400).json({ error: "report_id_required" });
  try {
    const ok = await deleteHepanReportById(uid, Math.floor(rid));
    if (!ok) return res.status(404).json({ error: "hepan_not_found" });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/api/hepan/compute", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const uid = (req as any).userId as number;
  const aRaw = Number(body.profile_id_a ?? "");
  const bRaw = Number(body.profile_id_b ?? "");
  const refresh = Boolean((body as any)?.refresh);
  const relationRaw = String((body as any)?.relation ?? "").trim();
  const relation = relationRaw ? relationRaw.slice(0, 16) : "";
  if (!Number.isFinite(aRaw) || aRaw <= 0 || !Number.isFinite(bRaw) || bRaw <= 0) {
    return res.status(400).json({ error: "profile_id_pair_required" });
  }
  const a0 = Math.floor(aRaw);
  const b0 = Math.floor(bRaw);
  const profileIdA = Math.min(a0, b0);
  const profileIdB = Math.max(a0, b0);

  try {
    if (!refresh) {
      const cached = await getHepanReportCache(uid, profileIdA, profileIdB);
      if (cached?.ai_text) {
        return res.json({ report: cached, from_cache: true });
      }
    }

    const pA = await getProfileById(uid, profileIdA);
    const pB = await getProfileById(uid, profileIdB);
    if (!pA || !pB) return res.status(404).json({ error: "profile_not_found" });
    const metaA = (pA.meta ?? {}) as Record<string, unknown>;
    const metaB = (pB.meta ?? {}) as Record<string, unknown>;

    const birthA = {
      date: pickString(metaA, "birth_date"),
      time: pickString(metaA, "birth_time"),
      tz: pickString(metaA, "birth_timezone") || "Asia/Shanghai",
      loc: pickLocation(metaA),
      gender: pickGender(metaA),
      cal: pickString(metaA, "birth_calendar_type").toLowerCase() === "lunar" ? "lunar" : "solar",
      leap: Boolean((metaA as any)?.birth_lunar_leap),
    };
    const birthB = {
      date: pickString(metaB, "birth_date"),
      time: pickString(metaB, "birth_time"),
      tz: pickString(metaB, "birth_timezone") || "Asia/Shanghai",
      loc: pickLocation(metaB),
      gender: pickGender(metaB),
      cal: pickString(metaB, "birth_calendar_type").toLowerCase() === "lunar" ? "lunar" : "solar",
      leap: Boolean((metaB as any)?.birth_lunar_leap),
    };
    if (!birthA.date || !birthA.time || !birthA.loc || !birthB.date || !birthB.time || !birthB.loc) {
      return res.status(400).json({ error: "profile_incomplete" });
    }

    const chartA = calculateBaziFromSolar(
      birthA.date,
      birthA.time,
      birthA.loc,
      birthA.cal === "lunar" ? "lunar" : "solar",
      birthA.gender,
      birthA.tz,
      birthA.leap
    );
    const chartB = calculateBaziFromSolar(
      birthB.date,
      birthB.time,
      birthB.loc,
      birthB.cal === "lunar" ? "lunar" : "solar",
      birthB.gender,
      birthB.tz,
      birthB.leap
    );

    const prompt = `
你是严谨、结构化、可执行的「合盘」分析师。请用简体中文输出，允许使用 Markdown（标题/列表/引用/加粗）。
写作要求：
- 不要玄学口吻与夸张断言；用“倾向/条件/概率/边界”表达。
- 不要输出任何隐私数据（手机号/邮箱/住址等）。
- 结论要可执行：给到「怎么做」「怎么沟通」「怎么设边界」「怎么止损」。
- 先给总评，再给证据与建议；避免堆术语。
- **重点适度**：全篇使用 Markdown 加粗（**...**）不超过 12 处；每个小节最多 2 处加粗，且只加粗“结论/风险/建议标题”这类关键词，避免满屏红。
- 建议条目尽量使用“- **标题**：内容”格式，但不要每句都加粗。
- **必须足够丰富**：总字数不少于 1200 字（不含分隔线），不要只写 3-5 条就结束；每节都要有内容。
- 论证方式：先讲“你们分别是什么风格/需求”，再讲“组合后会发生什么”，最后给“怎么做”。

关系设定：${relation || "未指定（按亲密关系/长期合作的通用口径）"}

对象A：${pA.name}（性别：${birthA.gender === 0 ? "女" : "男"}；历法：${birthA.cal === "lunar" ? "农历" : "公历"}）
四柱：年${chartA.pillars.year} 月${chartA.pillars.month} 日${chartA.pillars.day} 时${chartA.pillars.hour}
日主强弱：${chartA.day_master?.strength_level ?? ""} ${chartA.day_master?.strength_score ?? ""}
喜用：${(chartA.day_master?.useful_elements ?? []).join("、") || "—"}
忌神：${(chartA.day_master?.avoid_elements ?? []).join("、") || "—"}

对象B：${pB.name}（性别：${birthB.gender === 0 ? "女" : "男"}；历法：${birthB.cal === "lunar" ? "农历" : "公历"}）
四柱：年${chartB.pillars.year} 月${chartB.pillars.month} 日${chartB.pillars.day} 时${chartB.pillars.hour}
日主强弱：${chartB.day_master?.strength_level ?? ""} ${chartB.day_master?.strength_score ?? ""}
喜用：${(chartB.day_master?.useful_elements ?? []).join("、") || "—"}
忌神：${(chartB.day_master?.avoid_elements ?? []).join("、") || "—"}

请按「八字解读」同款风格输出以下结构（必须逐段输出）：

## 1) 一句话总评（<=25字）
- 用“适配度 + 风险点 + 建议动作”一句话说清（句内至少 1 处加粗重点）

## 2) 匹配度拆解（打分 + 解释）
- 维度与分数（0–10）：情绪与安全感 / 沟通与冲突 / 价值观与目标 / 金钱与责任 / 亲密与边界 / 长期稳定性
- 每个维度给 2 句理由（结合双方强弱/喜忌/性格倾向），并给 1 条可执行建议

## 3) 适配亮点（3–5条）
- 每条包含：亮点 → 触发条件 → 具体用法（如何让它变成优势）

## 4) 主要冲突点（3–5条，带触发场景）
- 每条包含：冲突点 → 典型触发场景 → 你们分别会怎么反应 → 怎么化解

## 5) 相处/合作建议（可执行，8–12条）
- 覆盖：沟通节奏、金钱与责任分工、亲密边界、家庭/事业优先级、冲突复盘方式
- 建议要“可落地”：每条都给出一句可直接照着说的话，或一个具体规则/约定

## 6) 红线与止损（3条）
- 明确哪些情况需要暂停、冷静期、第三方介入或分开

## 7) 未来3个月的实践计划（轻量）
- 以周为单位给 3–6 个小目标（例如：每周一次复盘、每月一次共同目标对齐）

## 8) 追问建议（给用户 5 个可继续问的问题）
- 例如：我该怎么说才能让TA听进去？我们最大风险点是什么？金钱怎么约定？等等
`.trim();

    const aiText = await generateGenericAiText(prompt);
    const provider = process.env.ALI_API_KEY ? "qwen" : "fallback";
    const payload = {
      one_line: "",
      relation: relation || "",
      a: { id: profileIdA, name: pA.name },
      b: { id: profileIdB, name: pB.name },
      pillars: { a: chartA.pillars, b: chartB.pillars },
    } satisfies Record<string, unknown>;

    const saved = await upsertHepanReport({
      user_id: uid,
      profile_id_a: profileIdA,
      profile_id_b: profileIdB,
      profile_name_a: pA.name,
      profile_name_b: pB.name,
      payload,
      ai_text: aiText,
      provider,
    });
    return res.json({ report: saved, from_cache: false });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/api/hepan/:reportId/messages", requireAuth, async (req, res) => {
  const uid = (req as any).userId as number;
  try {
    const rid = Number(req.params.reportId ?? "");
    if (!Number.isFinite(rid) || rid <= 0) return res.status(400).json({ error: "report_id_required" });
    const question = String(req.body?.question ?? "").trim();
    if (!question) return res.status(400).json({ error: "question_required" });
    const report = await getHepanReportById(uid, Math.floor(rid));
    if (!report) return res.status(404).json({ error: "hepan_not_found" });

    const provider = process.env.ALI_API_KEY ? "qwen" : "fallback";
    if (!process.env.ALI_API_KEY) {
      return res.json({
        report_id: report.id,
        provider,
        answer: "当前未配置通义密钥，追问暂不可用。请在 `.env` 配置 `ALI_API_KEY` 与 `ALI_MODEL=qwen3-max` 后重启服务。",
      });
    }

    const { qwenChatCompletion } = await import("./lib/aiClient.js");
    const ctx = String(report.ai_text || "").slice(0, 7000);
    const out = await qwenChatCompletion({
      model: process.env.ALI_MODEL?.trim() || "qwen3-max",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "你是严谨、可执行的合盘解读助手。用简体中文回答，允许使用 Markdown（标题/列表/引用/加粗）。先给结论，再给依据与可执行建议；不要输出隐私信息；不要夸张断言。重点适度：全篇加粗不超过 8 处，只加粗关键结论/风险/建议标题，避免满屏加粗。建议尽量用“- **标题**：内容”输出，但不要每句都加粗。",
        },
        {
          role: "user",
          content: [
            `report_id=${report.id}`,
            `关系=${String((report.payload as any)?.relation || "") || "未指定"}`,
            `对象A=${String(report.profile_name_a || "A")}`,
            `对象B=${String(report.profile_name_b || "B")}`,
            "",
            ctx ? "已有合盘解读（上下文）：" : "已有合盘解读（上下文）：（无）",
            ctx,
            "",
            "用户追问：",
            question,
          ].join("\n"),
        },
      ],
    });
    if (!out.ok) return res.json({ report_id: report.id, provider, answer: "追问失败，请稍后重试。" });
    return res.json({ report_id: report.id, provider, answer: out.text });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

/** 按 chart_id 读取已保存排盘（分享链接落地页等） */
app.get("/api/bazi/chart", async (req, res) => {
  const chartId = String(req.query.chart_id ?? "");
  if (!chartId) return res.status(400).json({ error: "chart_id_required" });
  const chart = await getChart(chartId);
  if (!chart) return res.status(404).json({ error: "chart_not_found" });
  res.json(enrichChartFortuneCycles(chart));
});

app.get("/api/reports/pro", async (req, res) => {
  const chartId = String(req.query.chart_id ?? "");
  const anonId = String(req.query.anon_id ?? "");
  if (!chartId || !anonId) {
    return res.status(400).json({ error: "chart_id_and_anon_id_required" });
  }
  const chart = await getChart(chartId);
  if (!chart) {
    return res.status(404).json({ error: "chart_not_found" });
  }
  const payload = await getProReportDynamic({
    chart_id: chartId,
    anon_id: anonId,
    five_elements: chart.five_elements,
    ge_ju: chart.ge_ju,
  });
  return res.json(payload);
});

app.get("/api/reports/ai", async (req, res) => {
  const chartId = String(req.query.chart_id ?? "");
  if (!chartId) return res.status(400).json({ error: "chart_id_required" });
  const chart = await getChart(chartId);
  if (!chart) return res.status(404).json({ error: "chart_not_found" });
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-Accel-Buffering", "no");
  const strongest = maxElement(chart.five_elements);
  const weakest = minElement(chart.five_elements);
  const ageQ = Number(req.query.age_shisui ?? "");
  const modeRaw = String(req.query.mode ?? "").toLowerCase();
  const analyst_mode:
    | "full"
    | "career"
    | "wealth"
    | "love"
    | "children"
    | "kinship"
    | "health"
    | "study" =
    modeRaw === "career"
      ? "career"
      : modeRaw === "wealth"
        ? "wealth"
        : modeRaw === "love"
          ? "love"
          : modeRaw === "children"
            ? "children"
            : modeRaw === "kinship"
              ? "kinship"
              : modeRaw === "health"
                ? "health"
                : modeRaw === "study"
                  ? "study"
                  : "full";
  const refresh =
    String(req.query.refresh ?? "") === "1" || String(req.query.refresh ?? "").toLowerCase() === "true";

  if (!refresh) {
    const cached = await getAiReadingCache(chartId, analyst_mode);
    if (cached) {
      return res.json({
        chart_id: chartId,
        ai_text: cached.ai_text,
        analyst_mode,
        provider: cached.provider,
        from_cache: true,
      });
    }
  }

  const text = await generateAiReading({
    chart_id: chartId,
    one_line: chart.user_readable?.one_line || chart.basic_summary,
    ge_ju: chart.ge_ju,
    strongest_element: toCnElement(strongest),
    weakest_element: toCnElement(weakest),
    useful_elements: chart.day_master?.useful_elements || [],
    avoid_elements: chart.day_master?.avoid_elements || [],
    liu_nian_preview: chart.fortune_cycles?.liu_nian_preview || [],
    full_chart: chart,
    gender_label: chart.gender === 0 ? "女" : chart.gender === 1 ? "男" : undefined,
    age_shisui: Number.isFinite(ageQ) && ageQ > 0 && ageQ < 130 ? Math.floor(ageQ) : undefined,
    analyst_mode,
  });
  const provider = process.env.ALI_API_KEY ? "qwen" : "fallback";
  await saveAiReadingCache(chartId, analyst_mode, text, provider);
  return res.json({
    chart_id: chartId,
    ai_text: text,
    analyst_mode,
    provider,
    from_cache: false,
  });
});

app.post("/api/reports/ai/messages", async (req, res) => {
  try {
    const chartId = String(req.body?.chart_id ?? "");
    const question = String(req.body?.question ?? "").trim();
    const modeRaw = String(req.body?.mode ?? "").toLowerCase();
    const analyst_mode:
      | "full"
      | "career"
      | "wealth"
      | "love"
      | "children"
      | "kinship"
      | "health"
      | "study" =
      modeRaw === "career"
        ? "career"
        : modeRaw === "wealth"
          ? "wealth"
          : modeRaw === "love"
            ? "love"
            : modeRaw === "children"
              ? "children"
              : modeRaw === "kinship"
                ? "kinship"
                : modeRaw === "health"
                  ? "health"
                  : modeRaw === "study"
                    ? "study"
                    : "full";
    if (!chartId) return res.status(400).json({ error: "chart_id_required" });
    if (!question) return res.status(400).json({ error: "question_required" });
    const chart = await getChart(chartId);
    if (!chart) return res.status(404).json({ error: "chart_not_found" });

    const strongest = maxElement(chart.five_elements);
    const weakest = minElement(chart.five_elements);

    // Use cached long reading as context if available (cheap + stable).
    const cached = await getAiReadingCache(chartId, analyst_mode);
    const baseReading = cached?.ai_text || "";

    const provider = process.env.ALI_API_KEY ? "qwen" : "fallback";
    if (!process.env.ALI_API_KEY) {
      return res.json({
        chart_id: chartId,
        mode: analyst_mode,
        provider,
        answer:
          "当前未配置通义密钥，追问暂不可用。你可以先在 `.env` 配置 `ALI_API_KEY` 与 `ALI_MODEL=qwen3-max`，再重启服务后重试。",
      });
    }

    const { qwenChatCompletion } = await import("./lib/aiClient.js");
    const out = await qwenChatCompletion({
      model: process.env.ALI_MODEL?.trim() || "qwen3-max",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "你是严谨、可执行的八字解读助手。用简体中文回答，允许使用 Markdown（标题/列表/引用/加粗）。先给结论，再给依据与行动建议；避免玄虚与夸张断言。",
        },
        {
          role: "user",
          content: [
            `chart_id=${chartId}`,
            `analyst_mode=${analyst_mode}`,
            `一句话=${chart.user_readable?.one_line || chart.basic_summary || "—"}`,
            `格局=${chart.ge_ju || "—"}`,
            `五行偏强=${toCnElement(strongest)}`,
            `五行偏弱=${toCnElement(weakest)}`,
            `喜用=${(chart.day_master?.useful_elements || []).join("、") || "—"}`,
            `忌神=${(chart.day_master?.avoid_elements || []).join("、") || "—"}`,
            "",
            baseReading ? "已有解读（摘要/上下文）：" : "已有解读（摘要/上下文）：（无缓存）",
            baseReading ? baseReading.slice(0, 6000) : "",
            "",
            "用户追问：",
            question,
          ].join("\n"),
        },
      ],
    });
    if (!out.ok) {
      return res.json({ chart_id: chartId, mode: analyst_mode, provider, answer: "追问失败，请稍后重试。" });
    }
    return res.json({ chart_id: chartId, mode: analyst_mode, provider, answer: out.text });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/api/ai/generate", async (req, res) => {
  const { scene, user_goal, context } = req.body ?? {};
  if (!scene) return res.status(400).json({ error: "scene_required" });
  const s = String(scene);
  if (s !== "stocks" && s !== "travel" && s !== "comic") return res.status(400).json({ error: "unsupported_scene" });

  const prompt = buildScenePrompt(s as any, String(user_goal ?? ""), context ?? {});
  const text = await generateGenericAiText(prompt);
  return res.json({ scene: s, text, provider: process.env.ALI_API_KEY ? "qwen" : "fallback" });
});

type WanxCreateBody = {
  prompt: string;
  negative_prompt?: string;
  size?: string;
  n?: number;
  model?: string;
};

const WANX_ALLOWED_SIZES = ["1024*1024", "720*1280", "1280*720", "768*1152"] as const;
const WANX_ALLOWED_SIZES_SET = new Set<string>(WANX_ALLOWED_SIZES);

async function wanxCreateTask(apiKey: string, body: WanxCreateBody) {
  const endpoint = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis";
  const m = String(body.model ?? process.env.ALI_WANX_MODEL ?? "wanx-v1");
  const sz = String(body.size ?? "1024*1024");
  if (!WANX_ALLOWED_SIZES_SET.has(sz)) {
    return { ok: false as const, error: { error: "invalid_size", allowed_sizes: WANX_ALLOWED_SIZES } };
  }
  const count = Math.max(1, Math.min(4, Number(body.n ?? 1) || 1));

  const createResp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: m,
      input: { prompt: body.prompt, ...(body.negative_prompt ? { negative_prompt: String(body.negative_prompt) } : {}) },
      parameters: { style: "<auto>", size: sz, n: count },
    }),
  });
  if (!createResp.ok) {
    return { ok: false as const, error: { error: "wanx_create_failed", detail: await createResp.text() } };
  }
  const created = (await createResp.json()) as any;
  const taskId = created?.output?.task_id;
  if (!taskId) return { ok: false as const, error: { error: "wanx_missing_task_id", detail: created } };
  return { ok: true as const, task_id: String(taskId), model: m, size: sz };
}

async function wanxFetchTask(apiKey: string, taskId: string) {
  const taskUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(String(taskId))}`;
  const r = await fetch(taskUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!r.ok) return { ok: false as const, error: { error: "wanx_poll_failed", detail: await r.text() } };
  const data = (await r.json()) as any;
  const status = String(data?.output?.task_status || data?.status || "");
  const results = data?.output?.results || [];
  const urls = Array.isArray(results) ? results.map((x: any) => x?.url).filter(Boolean) : [];
  return { ok: true as const, task_status: status, urls, detail: data };
}

let mascotGenerating: Promise<string> | null = null;
let mascotTaskId: string | null = null;
let mascotTaskSavedAtMs = 0;

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureMascotImage(apiKey: string, host: string, publicDir: string): Promise<string> {
  const filePath = path.join(publicDir, "mascot.png");
  const statePath = path.join(publicDir, "mascot.task.json");
  if (await fileExists(filePath)) {
    const st = await fs.promises.stat(filePath);
    return `${host}/mascot.png?v=${st.mtimeMs}`;
  }

  if (!mascotGenerating) {
    mascotGenerating = (async () => {
      const prompt =
        "Q版、可爱、国风、二次元卡通插画风格，一个古风小馆的吉祥物角色（圆脸大眼睛，表情温和，自然微笑），正面或微正面半身像，脸部清晰可见不遮挡。场景：庭院小馆、木窗、屏风、灯笼、祥云、水墨纹样，玉色与金色主色调，暖灯光，画面干净但有环境氛围，高质量高清细节。";
      const negative_prompt = "遮挡脸部、侧脸、模糊、低清晰度、文字水印、logo、过多复杂背景、恐怖、写实摄影风、裸体、暴露";

      // Resume existing task if any.
      if (!mascotTaskId && (await fileExists(statePath))) {
        try {
          const raw = await fs.promises.readFile(statePath, "utf8");
          const obj = JSON.parse(raw) as any;
          if (obj?.task_id) {
            mascotTaskId = String(obj.task_id);
            mascotTaskSavedAtMs = Number(obj.saved_at_ms || 0) || 0;
          }
        } catch {
          // ignore
        }
      }

      if (!mascotTaskId) {
        // Use a landscape size to match card slots and (often) faster queue.
        const created = await wanxCreateTask(apiKey, { prompt, negative_prompt, size: "1280*720", n: 1 });
        if (!created.ok) throw new Error(`wanx_create_failed:${created.error?.error || "unknown"}`);
        mascotTaskId = created.task_id;
        mascotTaskSavedAtMs = Date.now();
        try {
          await writeFile(statePath, JSON.stringify({ task_id: mascotTaskId, saved_at_ms: mascotTaskSavedAtMs }));
        } catch {
          // ignore
        }
      }

      const deadline = Date.now() + 180_000;
      let url = "";
      while (Date.now() < deadline) {
        const out = await wanxFetchTask(apiKey, String(mascotTaskId));
        if (!out.ok) throw new Error(`wanx_poll_failed:${out.error?.error || "unknown"}`);
        if (out.task_status === "SUCCEEDED") {
          url = String(out.urls?.[0] || "");
          break;
        }
        if (out.task_status === "FAILED" || out.task_status === "CANCELED") {
          throw new Error(`wanx_task_${out.task_status.toLowerCase()}`);
        }
        await new Promise((r) => setTimeout(r, 1400));
      }
      if (!url) throw new Error("wanx_timeout");

      const imgResp = await fetch(url);
      if (!imgResp.ok) throw new Error("wanx_download_failed");
      const buf = Buffer.from(await imgResp.arrayBuffer());
      await writeFile(filePath, buf);
      try {
        await fs.promises.unlink(statePath);
      } catch {
        // ignore
      }
      mascotTaskId = null;
      mascotTaskSavedAtMs = 0;
      const st = await fs.promises.stat(filePath);
      return `${host}/mascot.png?v=${st.mtimeMs}`;
    })().finally(() => {
      mascotGenerating = null;
    });
  }

  return await mascotGenerating;
}

app.get("/api/images/mascot", async (req, res) => {
  const apiKey = process.env.ALI_API_KEY?.trim();
  if (!apiKey) return res.status(400).json({ error: "ali_api_key_required" });
  const host = `${req.protocol}://${req.get("host")}`;
  try {
    const filePath = path.join(publicDir, "mascot.png");
    if (await fileExists(filePath)) {
      const st = await fs.promises.stat(filePath);
      return res.json({ url: `${host}/mascot.png?v=${st.mtimeMs}`, status: "ready" });
    }
    // If generating, return a quick status for UI polling.
    if (mascotGenerating) return res.json({ status: "generating" });

    // Kick off generation in background and return quickly.
    void ensureMascotImage(apiKey, host, publicDir).catch(() => {
      // ignore (client can retry)
    });
    return res.json({ status: "generating" });
  } catch (e: any) {
    return res.status(502).json({ error: "mascot_generate_failed", detail: String(e?.message || e) });
  }
});

app.post("/api/images/wanx/create", async (req, res) => {
  const apiKey = process.env.ALI_API_KEY?.trim();
  if (!apiKey) return res.status(400).json({ error: "ali_api_key_required" });

  const { prompt, negative_prompt, size, n, model } = req.body ?? {};
  const p = String(prompt ?? "").trim();
  if (!p) return res.status(400).json({ error: "prompt_required" });

  const created = await wanxCreateTask(apiKey, { prompt: p, negative_prompt, size, n, model });
  if (!created.ok) return res.status(400).json(created.error);
  return res.json(created);
});

app.get("/api/images/wanx/tasks/:taskId", async (req, res) => {
  const apiKey = process.env.ALI_API_KEY?.trim();
  if (!apiKey) return res.status(400).json({ error: "ali_api_key_required" });
  const taskId = String(req.params.taskId ?? "").trim();
  if (!taskId) return res.status(400).json({ error: "task_id_required" });
  const out = await wanxFetchTask(apiKey, taskId);
  if (!out.ok) return res.status(502).json(out.error);
  return res.json({ task_id: taskId, task_status: out.task_status, urls: out.urls });
});

// Backward compatible: create + poll (best-effort) for clients that want one call.
app.post("/api/images/wanx", async (req, res) => {
  const apiKey = process.env.ALI_API_KEY?.trim();
  if (!apiKey) return res.status(400).json({ error: "ali_api_key_required" });
  const { prompt, negative_prompt, size, n, model } = req.body ?? {};
  const p = String(prompt ?? "").trim();
  if (!p) return res.status(400).json({ error: "prompt_required" });
  const created = await wanxCreateTask(apiKey, { prompt: p, negative_prompt, size, n, model });
  if (!created.ok) return res.status(400).json(created.error);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const out = await wanxFetchTask(apiKey, created.task_id);
    if (!out.ok) return res.status(502).json(out.error);
    if (out.task_status === "SUCCEEDED") return res.json({ ...created, urls: out.urls });
    if (out.task_status === "FAILED" || out.task_status === "CANCELED") {
      return res.status(502).json({ error: "wanx_task_failed", task_id: created.task_id });
    }
    await new Promise((r2) => setTimeout(r2, 1400));
  }
  return res.status(504).json({ error: "wanx_timeout", task_id: created.task_id });
});

app.post("/api/share-cards/render", (req, res) => {
  const { chart_id, template_id, anon_id } = req.body ?? {};
  if (!chart_id || !template_id) {
    return res.status(400).json({ error: "chart_id_and_template_id_required" });
  }

  const token = crypto.randomBytes(8).toString("hex");
  const host = `${req.protocol}://${req.get("host")}`;
  const imageUrl = `${host}/share/${chart_id}.svg?t=${token}&tpl=${encodeURIComponent(String(template_id))}`;
  const shareUrl = `${host}/r/${chart_id}?src=share&t=${token}`;
  const abGroup = assignAbGroup(String(anon_id ?? "guest"));
  return res.json({ image_url: imageUrl, share_url: shareUrl, ab_group: abGroup });
});

app.get("/share/:chartId.svg", async (req, res) => {
  const chart = await getChart(String(req.params.chartId));
  if (!chart) return res.status(404).send("not found");
  const summary = (chart.user_readable?.one_line || chart.basic_summary).slice(0, 72);
  const pillars = `${chart.pillars.year} ${chart.pillars.month} ${chart.pillars.day} ${chart.pillars.hour}`;
  const birthLoc = (chart.birth_location || "").trim().slice(0, 64) || "—";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f2a6b"/><stop offset="100%" stop-color="#3a1c71"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="70" y="120" fill="#eaf0ff" font-size="48" font-family="Arial">八字解读卡片</text>
  <text x="70" y="200" fill="#ffffff" font-size="34" font-family="Arial">${escapeXml(summary)}</text>
  <text x="70" y="280" fill="#cdd6ff" font-size="28" font-family="Arial">四柱：${escapeXml(pillars)}</text>
  <text x="70" y="330" fill="#cdd6ff" font-size="26" font-family="Arial">出生地：${escapeXml(birthLoc)}</text>
  <text x="70" y="380" fill="#cdd6ff" font-size="26" font-family="Arial">格局：${escapeXml(chart.ge_ju || "-")}</text>
  <text x="70" y="430" fill="#cdd6ff" font-size="24" font-family="Arial">真太阳时：${escapeXml(chart.true_solar_time || "-")}</text>
  <text x="70" y="560" fill="#aab6ff" font-size="22" font-family="Arial">Astrology Lab · ${escapeXml(req.params.chartId)}</text>
</svg>`;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.send(svg);
});

app.get("/r/:chartId", (req, res) => {
  res.redirect(`/bazi?chart_id=${encodeURIComponent(String(req.params.chartId))}`);
});

app.get("/api/admin/metrics", requireAdmin, async (_req, res) => {
  res.json(await getMetrics());
});

app.post("/api/admin/smtp/test", requireAdmin, async (req, res) => {
  try {
    const to = String(req.body?.to ?? "").trim();
    if (!to) return res.status(400).json({ error: "to_required" });
    await sendTestEmail(to);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/api/admin/smtp/status", requireAdmin, (_req, res) => {
  // Do not leak secrets; only show presence and basic parsed fields.
  const cwd = process.cwd();
  const envPath = path.join(cwd, ".env");
  let envFileExists = false;
  try {
    envFileExists = fs.existsSync(envPath);
  } catch {
    envFileExists = false;
  }
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const portRaw = String(process.env.SMTP_PORT ?? "").trim();
  const port = Number(portRaw);
  const secure = String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "").trim();
  const from = String(process.env.SMTP_FROM ?? "").trim() || user;
  return res.json({
    ok: true,
    runtime: { cwd, envFileExists },
    present: {
      SMTP_HOST: Boolean(host),
      SMTP_PORT: Boolean(portRaw),
      SMTP_SECURE: Boolean(String(process.env.SMTP_SECURE ?? "").trim()),
      SMTP_USER: Boolean(user),
      SMTP_PASS: Boolean(pass),
      SMTP_FROM: Boolean(String(process.env.SMTP_FROM ?? "").trim() || user),
    },
    parsed: {
      host: host || null,
      port: Number.isFinite(port) ? port : null,
      secure,
      user: user ? user.replace(/^[^@]{2}/, "**") : null,
      from: from ? from.replace(/^[^<]{2}/, "**") : null,
    },
  });
});

app.get("/terms", (_req, res) => res.sendFile(path.join(publicDir, "terms.html")));
app.get("/privacy", (_req, res) => res.sendFile(path.join(publicDir, "privacy.html")));
app.get("/api/admin/storage", requireAdmin, (_req, res) => res.json({ mode: getStorageMode() }));

app.post("/api/events/track", async (req, res) => {
  const body = req.body ?? {};
  if (!body.event_name || !body.anon_id || !body.session_id) {
    return res.status(400).json({ error: "event_name_anon_id_session_id_required" });
  }
  if (String(body.event_name).length > 64 || String(body.anon_id).length > 128 || String(body.session_id).length > 128) {
    return res.status(400).json({ error: "invalid_event_payload" });
  }
  await trackEvent(body);
  return res.status(204).send();
});

function escapeXml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isValidDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidTimeString(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function isValidTimezone(timezone: string): boolean {
  const n = Number(timezone);
  if (Number.isFinite(n) && n >= -12 && n <= 14) return true;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isValidLocationInput(location: string): boolean {
  const trimmed = location.trim();
  if (!trimmed) return false;
  if (trimmed.length > 40) return false;
  return /^[\p{Script=Han}a-zA-Z0-9.\-_]+$/u.test(trimmed);
}

function maxElement(elements: Record<string, number>): string {
  return Object.entries(elements).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "earth";
}

function minElement(elements: Record<string, number>): string {
  return Object.entries(elements).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "water";
}

function toCnElement(el: string): string {
  if (el === "wood") return "木";
  if (el === "fire") return "火";
  if (el === "earth") return "土";
  if (el === "metal") return "金";
  return "水";
}

function buildScenePrompt(scene: "stocks" | "travel" | "comic", userGoal: string, context: any): string {
  if (scene === "stocks") {
    const symbols = String(context?.symbols ?? "");
    const material = String(context?.material ?? "");
    return `
你是专业资产研究助理，请使用简体中文输出，重点是可执行与风险控制，不要装神弄鬼。
严格要求：不构成投资建议；不得给出“买/卖/必涨”结论，只能给“信息整理 + 风险提示 + 需要核验的问题”。

用户目标：${userGoal || "稳健研究整理"}
标的：${symbols || "未提供"}
材料：${material || "未提供"}

输出结构：
1) 一句话总结（<=30字）
2) 关键要点（5条）
3) 风险清单（5条，按严重度排序）
4) 需要核验的问题（3条）
5) 行动清单（3条，偏信息收集与复盘）
`.trim();
  }

  if (scene === "comic") {
    const theme = String(context?.theme ?? "");
    const style = String(context?.style ?? "");
    const roles = String(context?.roles ?? "");
    const length = Math.max(3, Math.min(24, Number(context?.length ?? 8)));
    const constraints = String(context?.constraints ?? "");
    return `
你是“国风高级”风格的漫剧编剧与分镜导演，请用简体中文输出，避免过度中二与空洞抒情。

题材/主题：${theme || "未提供"}
风格：${style || "国风轻喜（克制、高级、好笑但不闹）"}
角色设定：${roles || "未提供"}
期望长度：${length} 镜
约束：${constraints || "未提供"}

输出结构：
1) 一句话卖点（<=25字）
2) 角色卡（每个角色：一句定位 + 一句口头禅/语气）
3) 分镜脚本（共${length}镜；每镜包含：场景/镜头/动作/对白/情绪）
4) 结尾反转或留钩（1段）
5) 二创建议（3条：配色/节奏/字幕/镜头）
`.trim();
  }

  const dest = String(context?.dest ?? "");
  const days = Number(context?.days ?? 0);
  const budget = Number(context?.budget ?? 0);
  const prefs = String(context?.prefs ?? "");
  const constraints = String(context?.constraints ?? "");
  return `
你是旅行规划管家，请使用简体中文输出，行程要可执行、节奏合理。

目的地：${dest}
天数：${days}
预算（人民币）：${budget}
偏好：${prefs || "未提供"}
限制：${constraints || "未提供"}

输出结构：
1) 行程概览（1段）
2) Day1..Day${Math.max(1, Math.min(30, days || 5))}（每天：上午/下午/晚上 + 交通建议 + 用餐建议）
3) 预算拆分（交通/住宿/餐饮/门票/机动）
4) 打包清单（10项）
5) 风险与兜底（天气/拥挤/体力/临时变更）
`.trim();
}

async function generateGenericAiText(prompt: string): Promise<string> {
  const apiKey = process.env.ALI_API_KEY?.trim();
  if (!apiKey) {
    return `【AI（降级版）】\n${prompt}\n\n提示：配置 ALI_API_KEY 后将输出真实AI生成内容。`;
  }
  const baseUrl = (process.env.ALI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const model = process.env.ALI_MODEL?.trim() || "qwen3-max";
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        enable_thinking: false,
        messages: [
          { role: "system", content: "你是严谨、结构化、可执行的助手。" },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!resp.ok) return `【AI】请求失败：${resp.status}`;
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || "AI暂无输出";
  } catch {
    return "AI请求异常，请稍后重试。";
  }
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "unknown_error";
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: "error", type: "unhandled_error", message }));
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_server_error" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`astrologer-mvp listening on :${port}`);
});

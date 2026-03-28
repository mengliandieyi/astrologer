import "dotenv/config";
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
import { enrichChartFortuneCycles } from "./lib/enrichChartFortunes.js";
import { getChart, getMetrics, getStorageMode, saveChart } from "./lib/store.js";

type ChartRecord = {
  chart_id: string;
  /** 0 女 1 男 */
  gender?: 0 | 1;
  /** 排盘请求中的出生地（与真太阳时校正用 location 一致） */
  birth_location?: string;
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

app.get("/travel", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.sendFile(path.join(publicDir, "travel.html"));
});

app.get("/comic", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.sendFile(path.join(publicDir, "comic.html"));
});

app.get("/workspace", (_req, res) => {
  if (spaBuilt) return sendSpaIndex(res);
  res.status(404).type("txt").send("Workspace UI requires building the web app: cd web && npm run build");
});

app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    storage_mode: getStorageMode(),
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

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next();
  const got = req.header("x-admin-token") || "";
  if (got !== token) return res.status(401).json({ error: "unauthorized" });
  return next();
}

app.post("/api/bazi/calculate", async (req, res) => {
  const { birth_date, birth_time, timezone, location, calendar_type, gender } = req.body ?? {};
  if (!birth_date || !birth_time || !timezone || !location) {
    return res.status(400).json({ error: "missing_required_fields" });
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

  try {
    const chartId = crypto.randomUUID();
    const g = Number(gender) === 0 ? 0 : 1;
    const calc = calculateBaziFromSolar(
      String(birth_date),
      String(birth_time),
      String(location),
      calendar_type === "lunar" ? "lunar" : "solar",
      g,
      String(timezone)
    );
    const output: ChartRecord = {
      chart_id: chartId,
      gender: g,
      birth_location: String(location).trim(),
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
    await saveChart({ ...output, created_at: new Date().toISOString() });
    return res.json(output);
  } catch {
    return res.status(422).json({ error: "invalid_birth_datetime" });
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
  return res.json({
    chart_id: chartId,
    ai_text: text,
    analyst_mode,
    provider: process.env.ALI_API_KEY ? "qwen" : "fallback",
  });
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

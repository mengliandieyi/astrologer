import type { StoredChart } from "./store.js";
import {
  buildBaziCareerAnalystPrompt,
  buildBaziChildrenAnalystPrompt,
  buildBaziHealthAnalystPrompt,
  buildBaziKinshipAnalystPrompt,
  buildBaziLoveAnalystPrompt,
  buildBaziMasterAnalystPrompt,
  buildBaziStudyAnalystPrompt,
  buildBaziWealthAnalystPrompt,
} from "./baziAnalystPrompt.js";

type AiInput = {
  chart_id: string;
  one_line: string;
  ge_ju?: string;
  strongest_element: string;
  weakest_element: string;
  useful_elements: string[];
  avoid_elements: string[];
  liu_nian_preview: Array<{ year: number; gan_zhi: string }>;
  /** 完整命盘（与排盘 API 一致）；若提供则使用大师长提示词 */
  full_chart?: StoredChart;
  /** 覆盖 full_chart.gender 展示用：男 / 女 / 未提供 */
  gender_label?: string;
  age_shisui?: number;
  /** full 全项（默认）| career 事业 | wealth 财运 | love 婚恋 | children 子女 | kinship 六亲 | health 健康 | study 学业 */
  analyst_mode?: "full" | "career" | "wealth" | "love" | "children" | "kinship" | "health" | "study";
};

type ChatChoice = {
  message?: { content?: string };
};

type ChatResponse = {
  choices?: ChatChoice[];
};

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3-max";

/** 串行化通义请求，降低并发 429；多实例部署时每实例仍各有一条在飞 */
let qwenRequestTail = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 通义流式调用：onDelta 接收增量文本，返回完整文本。
 * 兼容 OpenAI 兼容层 SSE：data: {"choices":[{"delta":{"content":"..."}}]} \n\n  ... data: [DONE]
 */
export async function qwenStreamChatCompletion(args: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<{ ok: true; text: string; model: string } | { ok: false; error: string }> {
  const apiKey = process.env.ALI_API_KEY?.trim();
  if (!apiKey) return { ok: false as const, error: "ALI_API_KEY_NOT_SET" };
  const baseUrl = (process.env.ALI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = (args.model || process.env.ALI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const body = JSON.stringify({
    model,
    temperature: args.temperature ?? 0.4,
    enable_thinking: false,
    stream: true,
    messages: args.messages,
  });
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body,
      signal: args.signal,
    });
    if (!res.ok || !res.body) {
      return { ok: false as const, error: `HTTP_${res.status}: ${await res.text().catch(() => "")}` };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    let full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, "");
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            full += delta;
            args.onDelta(delta);
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
    if (!full) return { ok: false as const, error: "EMPTY_STREAM" };
    return { ok: true as const, text: full, model };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message || e) };
  }
}

export async function qwenChatCompletion(args: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
}): Promise<{ ok: true; text: string; model: string } | { ok: false; error: string }> {
  const apiKey = process.env.ALI_API_KEY?.trim();
  if (!apiKey) return { ok: false as const, error: "ALI_API_KEY_NOT_SET" };
  const baseUrl = (process.env.ALI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = (args.model || process.env.ALI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const body = JSON.stringify({
    model,
    temperature: args.temperature ?? 0.4,
    enable_thinking: false,
    messages: args.messages,
  });
  try {
    let res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body,
    });
    if (res.status === 429) {
      await sleep(2500);
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
      });
    }
    if (!res.ok) return { ok: false as const, error: await res.text() };
    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    if (!content) return { ok: false as const, error: "EMPTY_RESPONSE" };
    return { ok: true as const, text: content, model };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message || e) };
  }
}

export async function generateAiReading(input: AiInput): Promise<string> {
  const apiKey = process.env.ALI_API_KEY?.trim();
  if (!apiKey) {
    return buildFallback(input);
  }

  const next = qwenRequestTail.then(() => generateAiReadingSerial(input, apiKey));
  qwenRequestTail = next.then(() => undefined).catch(() => undefined);
  return next;
}

async function generateAiReadingSerial(input: AiInput, apiKey: string): Promise<string> {
  const baseUrl = (process.env.ALI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.ALI_MODEL?.trim() || DEFAULT_MODEL;

  const ch = input.full_chart;
  const useMaster =
    Boolean(ch?.pillars?.year && ch?.pillars?.month && ch?.pillars?.day && ch?.pillars?.hour);

  const genderResolved =
    input.gender_label ?? (ch?.gender === 0 ? "女命" : ch?.gender === 1 ? "男命" : "未提供");
  const meta = { gender_label: genderResolved, age_shisui: input.age_shisui };

  const prompt = useMaster && ch
    ? input.analyst_mode === "career"
      ? buildBaziCareerAnalystPrompt(ch, meta)
      : input.analyst_mode === "wealth"
        ? buildBaziWealthAnalystPrompt(ch, meta)
        : input.analyst_mode === "love"
          ? buildBaziLoveAnalystPrompt(ch, meta)
          : input.analyst_mode === "children"
            ? buildBaziChildrenAnalystPrompt(ch, meta)
            : input.analyst_mode === "kinship"
              ? buildBaziKinshipAnalystPrompt(ch, meta)
              : input.analyst_mode === "health"
                ? buildBaziHealthAnalystPrompt(ch, meta)
                : input.analyst_mode === "study"
                  ? buildBaziStudyAnalystPrompt(ch, meta)
                  : buildBaziMasterAnalystPrompt(ch, meta)
    : `
你是资深八字分析师，请使用简体中文输出，必须可读、可执行、避免玄虚。

输入信息：
- 排盘ID：${input.chart_id}
- 一句话结论：${input.one_line}
- 格局：${input.ge_ju || "未提供"}
- 五行偏强：${input.strongest_element}
- 五行偏弱：${input.weakest_element}
- 喜用：${input.useful_elements.join("、") || "无"}
- 忌神：${input.avoid_elements.join("、") || "无"}
- 近5年：${input.liu_nian_preview.map((x) => `${x.year}${x.gan_zhi}`).join("、")}

请输出以下四段（每段2-4句）：
1) 事业与财务建议
2) 关系与沟通建议
3) 近5年节奏建议（逐年一句）
4) 风险提醒与行动清单（3条）
`.trim();

  // 通义 Qwen3 等非流式调用需显式关闭思考链，否则可能更慢或触发兼容层校验
  const body = JSON.stringify({
    model,
    temperature: 0.6,
    enable_thinking: false,
    messages: [
      { role: "system", content: "你是严谨、可执行的命理分析助手。" },
      { role: "user", content: prompt },
    ],
  });

  try {
    let res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    if (res.status === 429) {
      await sleep(2500);
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });
    }

    if (!res.ok) {
      return buildFallback(input);
    }
    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || buildFallback(input);
  } catch {
    return buildFallback(input);
  }
}

function buildFallback(input: AiInput): string {
  const head = input.full_chart?.pillars?.year
    ? "【AI深度解读（降级版 · 命盘参数已接收，可配置通义密钥以启用长文分析）】"
    : "【AI深度解读（降级版）】";
  return [
    head,
    `你当前结构偏向“${input.strongest_element}强、${input.weakest_element}弱”，建议先稳住基本盘，再做阶段扩张。`,
    `喜用元素：${input.useful_elements.join("、") || "无"}；忌神倾向：${input.avoid_elements.join("、") || "无"}。`,
    `近5年可重点关注：${input.liu_nian_preview.map((x) => `${x.year}${x.gan_zhi}`).join("、")}。`,
    "行动清单：1) 每季度只设1个核心目标；2) 遇重大决策先做小规模验证；3) 关系与合作先定边界再推进。",
  ].join("\n");
}

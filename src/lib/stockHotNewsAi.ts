import { qwenChatCompletion } from "./aiClient.js";

export type NewsBulletForAi = { title: string; summary: string; source: string };

/** 校验前端提交的当前列表子集，供 AI 总结（避免服务端再拉 RSS 与界面不一致）。 */
export function normalizeNewsItemsForAi(raw: unknown): NewsBulletForAi[] | null {
  if (!Array.isArray(raw)) return null;
  const out: NewsBulletForAi[] = [];
  for (const x of raw.slice(0, 20)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const title = String(o.title ?? "").trim().slice(0, 280);
    const source = String(o.source ?? "").trim().slice(0, 48);
    const summary = String(o.summary ?? "").trim().slice(0, 520);
    if (!title) continue;
    out.push({ title, summary, source });
  }
  return out.length ? out : null;
}

export function buildHotNewsSummaryUserPrompt(items: NewsBulletForAi[]): string {
  const lines = items.map((it, i) => {
    const sum = it.summary ? it.summary.replace(/\s+/g, " ").trim().slice(0, 220) : "";
    return `${i + 1}. [${it.source}] ${it.title}${sum ? ` — ${sum}` : ""}`;
  });
  return `以下为同一批资讯条目（标题与摘要摘录），请严格基于这些内容输出要点，不要编造未出现的公司、数据或事件：\n\n${lines.join("\n")}`;
}

export async function summarizeStockHotNewsWithQwen(items: NewsBulletForAi[]) {
  const user = buildHotNewsSummaryUserPrompt(items);
  const system = [
    "你是资深中文财经编辑，面向二级市场读者。",
    "任务：根据用户给出的多条新闻标题与摘要摘录，输出 5～8 条「要点速记」。",
    "硬性规则：",
    "1）每条要点单独一行，使用 Markdown 无序列表（以 \"- \" 开头），每条控制在 45 个汉字以内。",
    "2）只概括输入中明确出现的信息；不得捏造股票代码、数值、政策细节或机构名称。",
    "3）优先写市场影响、政策/数据方向、行业边际变化；避免复述标题原句。",
    "4）若材料重复或信息不足，合并为更少条数，并可用一条说明「其余条目信息重叠或偏个案」。",
    "5）不要输出代码块；不要加开场白或结束语。",
  ].join("\n");

  return qwenChatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.35,
  });
}

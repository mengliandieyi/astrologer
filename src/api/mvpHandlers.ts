import { assignAbGroup } from "../lib/abTest.js";
import { buildEvidence } from "../lib/evidenceBuilder.js";
import { saveEvent } from "../lib/store.js";

type EventPayload = {
  event_name: string;
  anon_id: string;
  session_id: string;
  report_id?: string;
  chart_id?: string;
  ab_group?: "A" | "B";
  props?: Record<string, unknown>;
};

const db = {
  async insertEvent(payload: EventPayload): Promise<void> {
    await saveEvent({
      ...payload,
      created_at: new Date().toISOString(),
    });
  },
};

export async function getProReport(query: { chart_id: string; anon_id: string }) {
  const abGroup = assignAbGroup(query.anon_id);

  const sections = [
    { title: "命盘总览", content: "整体呈现稳中求进的节奏，适合逐步升级路径。" },
    { title: "事业节奏", content: "建议先固化优势能力，再做跨域扩展。" },
    { title: "关系建议", content: "沟通偏理性，适合明确边界与预期。" },
    { title: "近12个月提示", content: "按季度设置目标，避免短期频繁切换。" },
  ];

  // A group: no evidence; B group: evidence chain.
  const evidence = abGroup === "B"
    ? buildEvidence({
        ten_god_officer_strong: true,
        wealth_weak: true,
        day_master: "weak",
      })
    : [];

  return {
    report_id: query.chart_id,
    ab_group: abGroup,
    confidence_score: evidence[0]?.confidence ?? 72,
    sections,
    evidence,
    gate_state: "free",
  };
}

type DynamicReportInput = {
  chart_id: string;
  anon_id: string;
  five_elements: Record<string, number>;
  ge_ju?: string;
};

export async function getProReportDynamic(input: DynamicReportInput) {
  const abGroup = assignAbGroup(input.anon_id);
  const strongest = maxElement(input.five_elements);
  const weakest = minElement(input.five_elements);
  const weakDayMaster = input.five_elements[strongest] - input.five_elements[weakest] >= 2;

  const sections = [
    { title: "命盘总览", content: `当前结构显示${toCn(strongest)}偏强、${toCn(weakest)}偏弱，宜以稳定节奏推进。` },
    { title: "格局参考", content: `当前月令主导倾向可归为${input.ge_ju ?? "平衡格"}，此项用于理解职业和节奏偏好。` },
    { title: "事业节奏", content: "优先巩固主能力，再逐步扩张边界，避免短期频繁切换。"},
    { title: "关系建议", content: "先明确预期和边界，再推进长期协同关系。"},
    { title: "近12个月提示", content: "按季度设定目标，执行上以稳中求进为主。"},
  ];

  const evidence = abGroup === "B"
    ? buildEvidence({
        ten_god_officer_strong: strongest === "earth" || strongest === "metal",
        wealth_weak: weakest === "water" || weakest === "metal",
        day_master: weakDayMaster ? "weak" : "balanced",
      })
    : [];

  return {
    report_id: input.chart_id,
    ab_group: abGroup,
    confidence_score: evidence[0]?.confidence ?? 72,
    sections,
    evidence,
    gate_state: "free",
  };
}

function maxElement(elements: Record<string, number>): string {
  return Object.entries(elements).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "earth";
}

function minElement(elements: Record<string, number>): string {
  return Object.entries(elements).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "water";
}

function toCn(el: string): string {
  if (el === "wood") return "木";
  if (el === "fire") return "火";
  if (el === "earth") return "土";
  if (el === "metal") return "金";
  return "水";
}

export async function trackEvent(body: EventPayload) {
  const event = {
    ...body,
    ab_group: body.ab_group ?? assignAbGroup(body.anon_id),
    props: body.props ?? {},
  };
  await db.insertEvent(event);
  return { ok: true };
}

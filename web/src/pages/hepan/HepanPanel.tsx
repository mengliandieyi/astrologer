import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { computeHepan, getHepanReport, type Profile } from "../../lib/authClient";

type HepanReport = Awaited<ReturnType<typeof getHepanReport>>["report"];

function explainError(message: string): string {
  const s = String(message || "").trim();
  try {
    const j = JSON.parse(s);
    const code = String(j?.error || "");
    if (code === "unauthorized") return "请先登录";
    if (code === "profile_id_pair_required") return "请选择两个档案";
    if (code === "profile_incomplete") return "档案信息未完善：请先补全历法、生日、出生时间、时区与省/市/区。";
    if (code) return code;
  } catch {
    // ignore
  }
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(s)) return "网络异常，请稍后重试";
  return s.slice(0, 160) || "请求失败";
}

export function HepanPanel(props: {
  loggedIn: boolean;
  profiles: Profile[];
  initialProfileIdA?: number | null;
  reportId?: number;
}) {
  const profiles = props.profiles || [];

  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [relation, setRelation] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [report, setReport] = useState<HepanReport | null>(null);

  const inFlightRef = useRef(false);

  useEffect(() => {
    const a0 = Number(props.initialProfileIdA ?? "");
    const hasA0 = Number.isFinite(a0) && a0 > 0 && profiles.some((p) => p.id === a0);
    const nextA = hasA0 ? a0 : profiles[0]?.id ?? null;
    setA(nextA ?? null);
    const nextB =
      profiles.find((p) => p.id !== nextA)?.id ?? (profiles.length ? profiles[0]?.id ?? null : null);
    setB(nextB ?? nextA ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.map((p) => p.id).join(","), props.initialProfileIdA]);

  useEffect(() => {
    if (!props.loggedIn) return;
    const rid = Number(props.reportId ?? "");
    if (!Number.isFinite(rid) || rid <= 0) return;
    setBusy(true);
    setStatus("正在加载合盘结果...");
    void getHepanReport(rid)
      .then((out) => {
        setReport(out.report);
        setStatus("已加载。");
      })
      .catch((e: any) => setStatus(`加载失败：${explainError(e?.message || e)}`))
      .finally(() => setBusy(false));
  }, [props.loggedIn, props.reportId]);

  const canCompute = Boolean(a && b && a !== b && props.loggedIn && !aiGenerating);

  async function run(refresh = false) {
    if (!props.loggedIn) {
      setStatus("请先登录。");
      return;
    }
    if (!a || !b || a === b) {
      setStatus("请选择两个不同的档案。");
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setAiGenerating(true);
    setStatus(refresh ? "正在重新生成合盘..." : "正在生成合盘...");
    try {
      const out = await computeHepan({ profile_id_a: a, profile_id_b: b, relation: relation.trim(), refresh });
      setReport(out.report);
      setStatus(out.from_cache ? "合盘已就绪。" : "合盘已完成。");
    } catch (e: any) {
      setStatus(`生成失败：${explainError(e?.message || e)}`);
    } finally {
      inFlightRef.current = false;
      setAiGenerating(false);
      setBusy(false);
    }
  }

  const disclaimer = useMemo(
    () => (
      <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1 text-xs text-[var(--text-muted)]">
        本内容由 AI 生成，仅供参考
      </span>
    ),
    []
  );

  return (
    <section className="mt-2 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <div className="home-landing-surface min-w-0 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <label className="text-xs font-semibold text-[var(--text-muted)]">对象 A</label>
            <select
              className="bazi-form-input mt-1 block h-10 min-w-0 max-w-full w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
              value={String(a ?? "")}
              onChange={(e) => setA(Number(e.target.value) || null)}
              disabled={busy}
            >
              <option value="">请选择档案</option>
              {profiles.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="text-xs font-semibold text-[var(--text-muted)]">关系</label>
            <select
              className="bazi-form-input mt-1 block h-10 min-w-0 max-w-full w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              disabled={busy}
            >
              <option value="">未指定</option>
              <option value="夫妻">夫妻</option>
              <option value="恋人">恋人</option>
              <option value="暧昧">暧昧</option>
              <option value="朋友">朋友</option>
              <option value="同事">同事</option>
              <option value="合作伙伴">合作伙伴</option>
              <option value="亲子">亲子</option>
              <option value="兄弟姐妹">兄弟姐妹</option>
              <option value="其他">其他</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="text-xs font-semibold text-[var(--text-muted)]">对象 B</label>
            <select
              className="bazi-form-input mt-1 block h-10 min-w-0 max-w-full w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
              value={String(b ?? "")}
              onChange={(e) => setB(Number(e.target.value) || null)}
              disabled={busy}
            >
              <option value="">请选择档案</option>
              {profiles.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => void run(false)} disabled={!canCompute} title={!canCompute ? "请选择两个不同档案并确保已登录" : undefined}>
            生成合盘
          </Button>
          <Button variant="secondary" onClick={() => void run(true)} disabled={!canCompute} title="强制重新生成（不会命中缓存）">
            重新生成
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/my/hepan">我的合盘</Link>
          </Button>
        </div>

        <div className="home-landing-surface-inset mt-4 px-4 py-3 text-sm text-[var(--text-main)]">{status || "准备就绪。"}</div>
      </div>

      <div className="home-landing-surface min-w-0 p-5 sm:p-6">
        {!report ? (
          <div className="text-sm text-[var(--text-muted)]">结果区：点击“生成合盘”后会在此展示合盘解读。</div>
        ) : (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold text-[var(--text-strong)]">合盘结果</span>
              <Badge>
                {String(report.profile_name_a || "A")} × {String(report.profile_name_b || "B")}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                {disclaimer}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/hepan?report_id=${encodeURIComponent(String(report.id))}`;
                    void (async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        setStatus("分享链接已复制。");
                      } catch {
                        setStatus("复制失败：请手动复制地址栏链接。");
                      }
                    })();
                  }}
                >
                  分享链接
                </Button>
              </div>
            </div>
            <div className="home-landing-surface-inset mt-3 min-h-[min(52vh,28rem)] border border-[rgba(74,120,108,0.22)] bg-[rgba(74,120,108,0.04)] p-3 sm:p-4">
              {aiGenerating ? (
                <div className="flex min-h-[min(48vh,26rem)] items-center justify-center rounded-lg border border-dashed border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-10 text-center">
                  <p className="text-sm text-[var(--text-muted)]">正在生成…</p>
                </div>
              ) : (
                <textarea
                  className="min-h-[min(48vh,26rem)] w-full resize-y rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3 text-sm leading-relaxed text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]"
                  value={String(report.ai_text || "")}
                  readOnly
                  aria-label="合盘解读正文"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}


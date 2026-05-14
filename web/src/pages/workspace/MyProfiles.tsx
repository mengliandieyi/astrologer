import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LunarYear } from "lunar-javascript";
import { GripVertical, Trash2 } from "lucide-react";
import { RegionCombobox } from "../../components/bazi/RegionCombobox";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { authLogout, authMe, createProfile, deleteProfile, getProfile, listProfiles, reorderProfiles, updateProfile, type Profile } from "../../lib/authClient";
import { TIMEZONE_OPTIONS_ZH } from "../../lib/timezonesZh";

function explainError(message: string): string {
  if (!message) return "请求失败，请稍后重试";
  if (message.includes("unauthorized")) return "请先登录";
  if (message.includes("profile_name_required")) return "请输入档案名称";
  if (message.includes("profile_name_taken")) return "该档案名已存在，请换一个";
  if (message.includes("profile_not_found")) return "档案不存在或已被删除，请刷新页面。";
  if (message.includes("profile_has_charts")) return "该档案下已有历史排盘，无法删除（请先升级服务端或联系管理员）。";
  if (message.includes("profiles_requires_mysql")) return "当前环境未启用 MySQL（档案功能需要 MySQL）。";
  if (message.includes("profile_reorder_invalid")) return "排序失败：请刷新页面后重试。";
  if (message.includes("ordered_ids_required")) return "排序参数无效。";
  return message.slice(0, 160);
}

function pick(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === "string" ? v.trim() : "";
}

function pickGender(meta: Record<string, unknown> | undefined): 0 | 1 | null {
  const v = meta?.["gender"];
  if (v === 0 || v === 1) return v;
  const n = Number(v);
  return Number.isFinite(n) ? (n === 0 ? 0 : 1) : null;
}

function ProfileSortableRow(props: {
  profile: Profile;
  summary: string;
  isActive: boolean;
  disabled: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { profile: p, summary, isActive, disabled, onSelect, onDelete } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
    zIndex: isDragging ? 2 : undefined,
    position: "relative" as const,
    boxShadow: isDragging ? "0 10px 28px rgba(28, 25, 23, 0.12)" : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex gap-0.5 rounded-xl border px-1 py-1 transition ${
        isActive
          ? "border-[rgba(74,120,108,0.42)] bg-[rgba(74,120,108,0.06)]"
          : "border-[var(--border-soft)] hover:bg-[var(--surface-soft)]"
      }`}
    >
      <button
        type="button"
        className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded-lg px-1 py-2 text-[var(--text-muted)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-strong)] active:cursor-grabbing disabled:pointer-events-none disabled:opacity-40"
        aria-label="拖动调整顺序"
        title="拖动调整顺序"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left" onClick={onSelect}>
        <div className="text-sm font-extrabold text-[var(--text-strong)]">{p.name}</div>
        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{summary || "未完善出生信息（无法排盘）"}</div>
      </button>
      <button
        type="button"
        className="flex shrink-0 items-center justify-center rounded-lg px-1.5 py-2 text-[var(--text-muted)] hover:bg-[rgba(179,38,30,0.08)] hover:text-[var(--bazi-danger)] disabled:pointer-events-none disabled:opacity-40"
        aria-label={`删除档案「${p.name}」`}
        title="删除该档案"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void onDelete();
        }}
      >
        <Trash2 className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

export function MyProfiles() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editId = Number(params.get("edit") || "");
  const creating = params.get("new") === "1";

  const [loggedIn, setLoggedIn] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const [activeId, setActiveId] = useState<number | null>(null);
  const active = useMemo(() => profiles.find((p) => p.id === activeId) || null, [profiles, activeId]);

  const deleteConfirmDescription = useMemo(() => {
    if (deleteTarget == null) return undefined;
    const p = profiles.find((x) => x.id === deleteTarget);
    return p
      ? `确定删除「${p.name}」？将一并删除该档案下的历史排盘、AI 解读缓存，以及以该档案为参与方的合盘记录（不可恢复）。`
      : "确定删除该档案？将一并删除关联的历史排盘与合盘记录（不可恢复）。";
  }, [deleteTarget, profiles]);

  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<0 | 1>(1);
  const [birthCalendarType, setBirthCalendarType] = useState<"solar" | "lunar">("solar");
  const [birthLunarLeap, setBirthLunarLeap] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthTimezone, setBirthTimezone] = useState("Asia/Shanghai");
  const [birthLocation, setBirthLocation] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [regionMod, setRegionMod] = useState<any>(null);

  const provinceOptions = useMemo(() => (regionMod ? regionMod.filterProvinces(province) : []), [regionMod, province]);
  const cityOptions = useMemo(() => (regionMod ? regionMod.filterCities(province, city) : []), [regionMod, province, city]);
  const districtOptions = useMemo(
    () => (regionMod ? regionMod.filterDistricts(province, city, district) : []),
    [regionMod, province, city, district]
  );

  const RELATION_OPTIONS = useMemo(
    () => ["自己", "配偶", "父亲", "母亲", "儿子", "女儿", "孩子", "朋友", "同事", "其他"],
    []
  );

  const lunarLeapHint = useMemo(() => {
    if (birthCalendarType !== "lunar") return null as null | { leapMonth: number; year: number; month: number };
    const m = String(birthDate || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (!Number.isFinite(y) || y <= 0 || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
    try {
      const leap = LunarYear.fromYear(y).getLeapMonth();
      return { leapMonth: Number(leap) || 0, year: y, month: mo };
    } catch {
      return null;
    }
  }, [birthCalendarType, birthDate]);

  function ensureDefaults(meta: Record<string, unknown>) {
    const out: Record<string, unknown> = { ...meta };
    if (typeof out.relation !== "string" || !String(out.relation).trim()) out.relation = "自己";
    if (out.gender !== 0 && out.gender !== 1) out.gender = 1;
    if (out.birth_calendar_type !== "lunar" && out.birth_calendar_type !== "solar") out.birth_calendar_type = "solar";
    if (typeof out.birth_lunar_leap !== "boolean") out.birth_lunar_leap = false;
    if (typeof out.birth_timezone !== "string" || !String(out.birth_timezone).trim()) out.birth_timezone = "Asia/Shanghai";
    if (typeof out.birth_date !== "string" || !String(out.birth_date).trim()) out.birth_date = new Date().toISOString().slice(0, 10);
    if (typeof out.birth_time !== "string" || !String(out.birth_time).trim()) out.birth_time = "09:00";
    if (!out.birth_region || typeof out.birth_region !== "object") {
      out.birth_region = { province: "北京市", city: "北京市", district: "东城区" };
    }
    const r = out.birth_region as any;
    const loc = `${String(r?.province || "")}${String(r?.city || "")}${String(r?.district || "")}`.trim();
    if (typeof out.birth_location !== "string" || !String(out.birth_location).trim()) out.birth_location = loc;
    return out;
  }

  function inputCls() {
    return "mt-1 block h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]";
  }

  function comboInputCls() {
    return "h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]";
  }

  function labelCls() {
    return "text-xs font-semibold text-[var(--text-muted)]";
  }

  function loadForm(p: Profile) {
    setName(p.name || "");
    const meta0 = (p.meta ?? {}) as Record<string, unknown>;
    const meta = ensureDefaults(meta0);
    setRelation(pick(meta, "relation") || "自己");
    setNote(pick(meta, "note"));
    setPhone(pick(meta, "phone"));
    setEmail(pick(meta, "email"));
    const g = pickGender(meta);
    if (g === 0 || g === 1) setGender(g);
    setBirthCalendarType(meta.birth_calendar_type === "lunar" ? "lunar" : "solar");
    setBirthLunarLeap(Boolean((meta as any).birth_lunar_leap));
    setBirthDate(pick(meta, "birth_date") || new Date().toISOString().slice(0, 10));
    setBirthTime(pick(meta, "birth_time") || "09:00");
    setBirthTimezone(pick(meta, "birth_timezone") || "Asia/Shanghai");
    const region = (meta.birth_region && typeof meta.birth_region === "object" ? (meta.birth_region as any) : null) as
      | { province?: string; city?: string; district?: string }
      | null;
    const p1 = (region?.province || "").trim();
    const c1 = (region?.city || "").trim();
    const d1 = (region?.district || "").trim();
    setProvince(p1);
    setCity(c1);
    setDistrict(d1);
    const loc = pick(meta, "birth_location") || `${p1}${c1}${d1}`.trim();
    setBirthLocation(loc);
  }

  useEffect(() => {
    let cancelled = false;
    void import("../../lib/chinaRegion").then((m) => {
      if (!cancelled) setRegionMod(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loc = `${province}${city}${district}`.trim();
    if (loc) setBirthLocation(loc);
  }, [province, city, district]);

  async function refreshList(selectId?: number): Promise<number | null> {
    const out = await listProfiles();
    const ps = (out.profiles || []) as Profile[];
    setProfiles(ps);
    const nextId = selectId != null && ps.some((p) => p.id === selectId) ? selectId : ps[0]?.id ?? null;
    setActiveId(nextId);
    const picked = ps.find((p) => p.id === nextId) || null;
    if (picked) loadForm(picked);
    return nextId;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleProfileDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = profiles.findIndex((pr) => pr.id === Number(active.id));
    const newIndex = profiles.findIndex((pr) => pr.id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(profiles, oldIndex, newIndex);
    setBusy(true);
    setErr("");
    try {
      await reorderProfiles(nextOrder.map((x) => x.id));
      await refreshList(activeId ?? undefined);
    } catch (e: any) {
      setErr(explainError(String((e as any)?.message || e)));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void authMe()
      .then((m) => {
        if (cancelled) return;
        const ok = Boolean((m as any)?.logged_in);
        setLoggedIn(ok);
        if (!ok) {
          nav(`/login?next=${encodeURIComponent("/my/profiles")}`);
          return;
        }
        return refreshList().catch((e: any) => setErr(explainError(String(e?.message || e))));
      })
      .catch(() => {
        if (!cancelled) nav(`/login?next=${encodeURIComponent("/my/profiles")}`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    if (!Number.isFinite(editId) || editId <= 0) return;
    setBusy(true);
    setErr("");
    void getProfile(editId)
      .then((out) => {
        const p = out.profile as Profile;
        setActiveId(p.id);
        loadForm(p);
      })
      .catch((e: any) => setErr(explainError(String(e?.message || e))))
      .finally(() => setBusy(false));
  }, [loggedIn, editId]);

  useEffect(() => {
    if (!loggedIn) return;
    if (!creating) return;
    if (busy) return;
    setBusy(true);
    setErr("");
    const metaDefaults = {
      relation: "自己",
      gender: 1,
      birth_calendar_type: "solar",
      birth_date: new Date().toISOString().slice(0, 10),
      birth_time: "09:00",
      birth_timezone: "Asia/Shanghai",
      birth_region: { province: "北京市", city: "北京市", district: "东城区" },
      birth_location: "北京市北京市东城区",
    } satisfies Record<string, unknown>;
    void createProfile("新档案", metaDefaults)
      .then((out) => {
        const id = out.profile.id;
        nav(`/my/profiles?edit=${encodeURIComponent(String(id))}`, { replace: true });
        return refreshList(id);
      })
      .catch((e: any) => setErr(explainError(String(e?.message || e))))
      .finally(() => setBusy(false));
  }, [loggedIn, creating]);

  async function saveActive() {
    if (!activeId) return;
    setBusy(true);
    setErr("");
    try {
      const loc = `${province}${city}${district}`.trim() || birthLocation.trim();
      const meta: Record<string, unknown> = {
        relation: relation.trim(),
        note: note.trim(),
        phone: phone.trim(),
        email: email.trim(),
        gender,
        birth_calendar_type: birthCalendarType,
        birth_lunar_leap: Boolean(birthLunarLeap),
        birth_date: birthDate.trim(),
        birth_time: birthTime.trim(),
        birth_timezone: birthTimezone.trim(),
        birth_location: loc,
        birth_region: { province: province.trim(), city: city.trim(), district: district.trim() },
      };
      const out = await updateProfile(activeId, { name: name.trim(), meta });
      const next = profiles.map((p) => (p.id === activeId ? out.profile : p));
      setProfiles(next);
    } catch (e: any) {
      setErr(explainError(String(e?.message || e)));
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteProfile(profileId: number) {
    setDeleteTarget(profileId);
  }

  async function performDeleteProfile(profileId: number) {
    setBusy(true);
    setErr("");
    try {
      await deleteProfile(profileId);
      const wasActive = activeId === profileId;
      const nextId = await refreshList(wasActive ? undefined : activeId ?? undefined);
      if (wasActive) {
        if (nextId != null) {
          nav(`/my/profiles?edit=${encodeURIComponent(String(nextId))}`, { replace: true });
        } else {
          nav("/my/profiles", { replace: true });
        }
      }
    } catch (e: any) {
      setErr(explainError(String((e as any)?.message || e)));
    } finally {
      setBusy(false);
    }
  }

  function removeActive() {
    if (!activeId) return;
    requestDeleteProfile(activeId);
  }

  return (
    <div className="home-landing page-bazi pb-12">
      <header className="home-landing-header" aria-labelledby="my-profiles-title">
        <div className="home-landing-header-content">
          <h1 id="my-profiles-title" className="home-landing-title">
            我的档案
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/bazi">去排盘</Link>
          </Button>
          <Button size="sm" onClick={() => nav("/my/profiles?new=1")} disabled={busy}>
            新建档案
          </Button>
          {loggedIn ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void (async () => {
                  try {
                    await authLogout();
                  } finally {
                    nav(`/login?next=${encodeURIComponent("/my/profiles")}`, { replace: true });
                  }
                })();
              }}
            >
              退出登录
            </Button>
          ) : null}
        </div>
      </header>

      <section className="mt-2 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[1fr_1.6fr] lg:items-start">
        <div className="home-landing-surface min-w-0 p-5 sm:p-6">
          <div className="text-sm font-extrabold text-[var(--text-strong)]">档案列表</div>

          {err ? (
            <div className="home-landing-surface-inset mt-3 px-4 py-3 text-sm text-[var(--bazi-danger)]">
              {err}
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {profiles.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)]">暂无档案。点击右上角「新建档案」。</div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleProfileDragEnd(e)}>
                <SortableContext items={profiles.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                  {profiles.map((p) => {
                    const meta = (p.meta ?? {}) as Record<string, unknown>;
                    const summary = [
                      pick(meta, "relation") ? `关系：${pick(meta, "relation")}` : "",
                      pick(meta, "birth_date") ? `生日：${pick(meta, "birth_date")}` : "",
                      pick(meta, "birth_location") ? `地点：${pick(meta, "birth_location")}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const isActive = p.id === activeId;
                    return (
                      <ProfileSortableRow
                        key={p.id}
                        profile={p}
                        summary={summary}
                        isActive={isActive}
                        disabled={busy}
                        onSelect={() => {
                          setActiveId(p.id);
                          loadForm(p);
                          nav(`/my/profiles?edit=${encodeURIComponent(String(p.id))}`, { replace: true });
                        }}
                        onDelete={() => requestDeleteProfile(p.id)}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <div className="home-landing-surface min-w-0 p-5 sm:p-6">
          <div className="text-sm font-extrabold text-[var(--text-strong)]">档案信息</div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">联系方式/备注不会出现在分享链接里。</p>

          {!active ? (
            <div className="mt-4 text-sm text-[var(--text-muted)]">请先从左侧选择一个档案。</div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={labelCls()}>档案名</label>
                <input className={inputCls()} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className={labelCls()}>关系</label>
                <select className={inputCls()} value={relation} onChange={(e) => setRelation(e.target.value || "自己")}>
                  {RELATION_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className={labelCls()}>性别</label>
                <select className={inputCls()} value={String(gender)} onChange={(e) => setGender(e.target.value === "0" ? 0 : 1)}>
                  <option value="1">男</option>
                  <option value="0">女</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className={labelCls()}>历法</label>
                <select
                  className={inputCls()}
                  value={birthCalendarType}
                  onChange={(e) => setBirthCalendarType(e.target.value === "lunar" ? "lunar" : "solar")}
                >
                  <option value="solar">阳历（公历）</option>
                  <option value="lunar">阴历（农历）</option>
                </select>
              </div>
              {birthCalendarType === "lunar" ? (
                <div className="min-w-0">
                  <label className={labelCls()}>闰月</label>
                  <label
                    className="mt-1 flex h-10 items-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)]"
                    title="如果你的农历月份是闰月，请打开此开关"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--focus-ring)]"
                      checked={birthLunarLeap}
                      onChange={(e) => setBirthLunarLeap(Boolean(e.target.checked))}
                    />
                    <span className="text-sm">{birthLunarLeap ? "是闰月" : "非闰月"}</span>
                  </label>
                  {lunarLeapHint ? (
                    <div
                      className={`mt-1 text-xs ${
                        birthLunarLeap && lunarLeapHint.leapMonth === 0
                          ? "text-[var(--bazi-danger)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {lunarLeapHint.leapMonth > 0 ? (
                        <>
                          该年（{lunarLeapHint.year}）闰{lunarLeapHint.leapMonth}月
                          {birthLunarLeap && lunarLeapHint.month !== lunarLeapHint.leapMonth ? (
                            <>；你当前填的是{lunarLeapHint.month}月，通常不需要勾选</>
                          ) : (
                            <>；若生日在闰{lunarLeapHint.leapMonth}月请勾选</>
                          )}
                        </>
                      ) : (
                        <>该年（{lunarLeapHint.year}）无闰月；通常不需要勾选</>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-[var(--text-muted)]">提示：请先填写农历出生日期，再判断是否闰月</div>
                  )}
                </div>
              ) : (
                <div className="min-w-0" />
              )}
              <div className="min-w-0">
                <label className={labelCls()}>出生日期</label>
                <input className={inputCls()} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className={labelCls()}>出生时间</label>
                <input className={inputCls()} type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className={labelCls()}>时区</label>
                <select className={inputCls()} value={birthTimezone} onChange={(e) => setBirthTimezone(e.target.value || "Asia/Shanghai")}>
                  {TIMEZONE_OPTIONS_ZH.map((z) => (
                    <option key={z.iana} value={z.iana}>
                      {z.labelZh}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0" />
              <div className="min-w-0 sm:col-span-2">
                <label className={labelCls()}>出生地（省/市/区）</label>
                <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <RegionCombobox
                    value={province}
                    disabled={!regionMod}
                    options={provinceOptions}
                    placeholder="省份"
                    inputClassName={comboInputCls()}
                    emptyHint="暂无省份数据"
                    onValueChange={(v) => {
                      setProvince(v);
                      setCity("");
                      setDistrict("");
                    }}
                    onInputBlur={(v) => {
                      if (!regionMod) return;
                      const r = regionMod.resolveProvince(v);
                      if (r !== v) {
                        setProvince(r);
                        setCity("");
                        setDistrict("");
                      }
                    }}
                  />
                  <RegionCombobox
                    value={city}
                    disabled={!regionMod || !province}
                    options={cityOptions}
                    placeholder="城市"
                    inputClassName={comboInputCls()}
                    emptyHint={province ? "暂无匹配城市" : "请先选择省份"}
                    onValueChange={(v) => {
                      setCity(v);
                      setDistrict("");
                    }}
                    onInputBlur={(v) => {
                      if (!regionMod) return;
                      const r = regionMod.resolveCity(province, v);
                      if (r !== v) {
                        setCity(r);
                        setDistrict("");
                      }
                    }}
                  />
                  <RegionCombobox
                    value={district}
                    disabled={!regionMod || !province || !city}
                    options={districtOptions}
                    placeholder="区县"
                    inputClassName={comboInputCls()}
                    emptyHint={province && city ? "暂无匹配区县" : "请先选择省市"}
                    onValueChange={setDistrict}
                    onInputBlur={(v) => {
                      if (!regionMod) return;
                      const r = regionMod.resolveDistrict(province, city, v);
                      if (r !== v) setDistrict(r);
                    }}
                  />
                </div>
                <div className="mt-2 text-xs text-[var(--text-muted)]">当前拼接：{birthLocation || "—"}</div>
              </div>
              <div className="min-w-0">
                <label className={labelCls()}>手机号</label>
                <input className={inputCls()} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="可选" />
              </div>
              <div className="min-w-0">
                <label className={labelCls()}>邮箱</label>
                <input className={inputCls()} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="可选" />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <label className={labelCls()}>备注</label>
                <textarea
                  className="mt-1 block min-h-[92px] w-full resize-y rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="可选"
                />
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
                <Button onClick={() => void saveActive()} disabled={busy}>
                  保存档案
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!activeId) return;
                    nav(`/bazi?profile_id=${encodeURIComponent(String(activeId))}`);
                  }}
                  disabled={busy || !activeId}
                >
                  去排盘
                </Button>
                <Button variant="secondary" onClick={removeActive} disabled={busy}>
                  删除档案
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除档案"
        description={deleteConfirmDescription}
        danger
        busy={busy}
        onConfirm={async () => {
          const id = deleteTarget;
          if (id == null) return;
          setDeleteTarget(null);
          await performDeleteProfile(id);
        }}
      />
    </div>
  );
}


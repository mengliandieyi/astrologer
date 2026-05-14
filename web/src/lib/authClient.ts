import { getJson, postJson, patchJson, delJson } from "./http";

export type MeResp =
  | { logged_in: false }
  | { logged_in: true; user: { id: number; username: string } };


export async function authMe(): Promise<MeResp> {
  // Deduplicate frequent calls across headers/pages (URL param changes, etc.).
  const now = Date.now();
  if (authMeCache.value && now - authMeCache.at < 2500) return authMeCache.value;
  if (authMeCache.inflight) return authMeCache.inflight;
  authMeCache.inflight = getJson<MeResp>("/api/auth/me")
    .then((v) => {
      authMeCache.value = v;
      authMeCache.at = Date.now();
      return v;
    })
    .catch(() => {
      // 后端不可用时视为未登录，并 resolve（勿再 throw，否则 await authMe() 的页面会进 ErrorBoundary）
      authMeCache.value = { logged_in: false };
      authMeCache.at = Date.now();
      return { logged_in: false } as MeResp;
    })
    .finally(() => {
      authMeCache.inflight = null;
    });
  return authMeCache.inflight;
}

const authMeCache: { value: MeResp | null; at: number; inflight: Promise<MeResp> | null } = {
  value: null,
  at: 0,
  inflight: null,
};

export async function authLogin(username: string, password: string): Promise<{ user: { id: number; username: string } }> {
  return postJson("/api/auth/login", { username, password });
}

export async function authRegister(
  username: string,
  email: string,
  password: string
): Promise<{ user: { id: number; username: string } }> {
  return postJson("/api/auth/register", { username, email, password });
}

export async function authLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export async function authForgotPassword(email: string): Promise<{ ok: true }> {
  return postJson("/api/auth/forgot-password", { email });
}

export async function authResetPassword(token: string, password: string): Promise<{ ok: true }> {
  return postJson("/api/auth/reset-password", { token, password });
}

export type Profile = {
  id: number;
  user_id: number;
  name: string;
  meta?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  /** 越大在列表中越靠前（仅服务端排序用，可忽略） */
  sort_index?: number;
};

export async function listProfiles(): Promise<{ profiles: Profile[] }> {
  return getJson("/api/me/profiles");
}

export async function createProfile(
  name: string,
  meta?: Record<string, unknown>
): Promise<{ profile: Profile }> {
  return postJson("/api/me/profiles", { name, meta: meta ?? {} });
}

export async function getProfile(profileId: number): Promise<{ profile: Profile }> {
  return getJson(`/api/me/profiles/${profileId}`);
}

export async function updateProfile(
  profileId: number,
  patch: { name?: string; meta?: Record<string, unknown> }
): Promise<{ profile: Profile }> {
  return patchJson(`/api/me/profiles/${profileId}`, patch);
}

export async function deleteProfile(profileId: number): Promise<void> {
  await delJson(`/api/me/profiles/${profileId}`);
}

export async function reorderProfiles(ordered_ids: number[]): Promise<{ ok: boolean }> {
  return postJson("/api/me/profiles/reorder", { ordered_ids });
}

export async function listChartsByProfile(
  profileId: number,
  limit = 30
): Promise<{ charts: Array<{ chart_id: string; created_at: string; summary: string }> }> {
  return getJson(`/api/me/profiles/${profileId}/charts?limit=${encodeURIComponent(String(limit))}`);
}

/** 当前用户下全部命盘（按时间倒序），用于解梦等跨档案选择 */
export async function listChartsByUser(
  limit = 50
): Promise<{ charts: Array<{ chart_id: string; created_at: string; summary: string }> }> {
  return getJson(`/api/me/charts?limit=${encodeURIComponent(String(limit))}`);
}

/** 该档案在库中最近一次已存命盘（GET，不调用排盘计算） */
export async function getLatestChartForProfile(profileId: number): Promise<{ chart: Record<string, unknown> }> {
  return getJson(`/api/me/profiles/${encodeURIComponent(String(profileId))}/latest-chart`);
}

export type HepanListItem = { id: number; profile_name_a: string; profile_name_b: string; updated_at: string };
export type HepanReport = {
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

export async function listHepanReports(limit = 30): Promise<{ reports: HepanListItem[] }> {
  return getJson(`/api/me/hepan?limit=${encodeURIComponent(String(limit))}`);
}

export async function getHepanReport(reportId: number): Promise<{ report: HepanReport }> {
  return getJson(`/api/hepan/${encodeURIComponent(String(reportId))}`);
}

export async function deleteHepanReport(reportId: number): Promise<{ ok: true }> {
  return delJson(`/api/hepan/${encodeURIComponent(String(reportId))}`);
}

export async function computeHepan(input: {
  profile_id_a: number;
  profile_id_b: number;
  relation?: string;
  refresh?: boolean;
}): Promise<{ report: HepanReport; from_cache?: boolean }> {
  return postJson("/api/hepan/compute", input, { timeoutMs: 300_000 });
}


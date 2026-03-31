export type MeResp =
  | { logged_in: false }
  | { logged_in: true; user: { id: number; username: string } };

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export async function authMe(): Promise<MeResp> {
  return getJson<MeResp>("/api/auth/me");
}

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
  await fetch("/api/auth/logout", { method: "POST" });
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
  const res = await fetch(`/api/me/profiles/${profileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { profile: Profile };
}

export async function deleteProfile(profileId: number): Promise<void> {
  const res = await fetch(`/api/me/profiles/${profileId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function listChartsByProfile(
  profileId: number,
  limit = 30
): Promise<{ charts: Array<{ chart_id: string; created_at: string; summary: string }> }> {
  return getJson(`/api/me/profiles/${profileId}/charts?limit=${encodeURIComponent(String(limit))}`);
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
  const res = await fetch(`/api/hepan/${encodeURIComponent(String(reportId))}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { ok: true };
}

export async function computeHepan(input: {
  profile_id_a: number;
  profile_id_b: number;
  relation?: string;
  refresh?: boolean;
}): Promise<{ report: HepanReport; from_cache?: boolean }> {
  return postJson("/api/hepan/compute", input);
}


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

export async function authRegister(username: string, password: string): Promise<{ user: { id: number; username: string } }> {
  return postJson("/api/auth/register", { username, password });
}

export async function authLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export type Profile = { id: number; user_id: number; name: string; created_at: string; updated_at: string };

export async function listProfiles(): Promise<{ profiles: Profile[] }> {
  return getJson("/api/me/profiles");
}

export async function createProfile(name: string): Promise<{ profile: Profile }> {
  return postJson("/api/me/profiles", { name });
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


import { getCurrentAccessToken, getCurrentUser } from "./auth";
import { getSupabaseConfig } from "./config";

export type Survey = { id: string; name: string; location: string; drone: string; flight_date: string | null; notes: string; created_at: string };
export type SurveyImage = { name: string; id: string; created_at: string; metadata: { size?: number; mimetype?: string } | null };
export const imageBucket = "survey-images";

export async function surveySession() {
  const [user, token] = await Promise.all([getCurrentUser(), getCurrentAccessToken()]);
  if (!user || !token) throw new Error("Sua sessão expirou. Entre novamente.");
  return { user, token };
}

export async function supabaseRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${url}${path}`, {
    ...init, cache: "no-store",
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente.");
    const raw = await response.text().catch(() => "");
    let detail = raw;
    try {
      const parsed = JSON.parse(raw) as {message?:string;details?:string;hint?:string;code?:string};
      detail = [parsed.message,parsed.details,parsed.hint,parsed.code].filter(Boolean).join(" · ");
    } catch {}
    throw new Error(detail || `Supabase respondeu HTTP ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function listSurveys(token: string) {
  return supabaseRequest<Survey[]>("/rest/v1/surveys?select=id,name,location,drone,flight_date,notes,created_at&order=created_at.desc&limit=500", token);
}

export async function requireSurvey(id: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Levantamento inválido.");
  const rows = await supabaseRequest<Survey[]>(`/rest/v1/surveys?id=eq.${id}&select=*&limit=1`, token);
  if (!rows[0]) throw new Error("Levantamento não encontrado ou sem acesso.");
  return rows[0];
}

export async function listImages(id: string, userId: string, token: string) {
  await requireSurvey(id, token);
  const images: SurveyImage[] = [];
  for (let offset = 0; ; offset += 100) {
    const batch = await supabaseRequest<SurveyImage[]>(`/storage/v1/object/list/${imageBucket}`, token, {
      method: "POST", body: JSON.stringify({ prefix: `${userId}/${id}`, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    images.push(...batch.filter(image => image.id));
    if (batch.length < 100) return images;
  }
}

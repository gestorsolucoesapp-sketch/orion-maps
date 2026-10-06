import { getSupabaseConfig } from "./config";

export type ProcessingResult = {
  id: string;
  job_id: string;
  survey_id: string;
  kind: "orthophoto"|"dsm"|"dtm"|"point_cloud"|"mesh"|"contours"|"hillshade"|"slope"|"hypsometry"|"report"|"other";
  display_name: string | null;
  storage_path: string;
  web_preview_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  source_crs: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  preview_url: string | null;
  /** Original drone preview; signed with the current user's Storage permissions. */
  original_preview_url?: string | null;
  download_url: string | null;
  signed_url_expires_seconds: number;
};

export async function listProcessingResults(surveyId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(surveyId)) throw new Error("Levantamento inválido.");
  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${url}/functions/v1/processing-results`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ survey_id: surveyId }),
  });
  if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente.");
  if (!response.ok) throw new Error("Não foi possível carregar os resultados do processamento.");
  const data = await response.json() as { results?: ProcessingResult[] };
  return Array.isArray(data.results) ? data.results : [];
}

"use server";

import {validateStoredConfig,validateSurveyPlanning,customConfig} from "@/lib/survey-planning";
import {readCustomDroneProfile} from "./drone-actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { beginSurveyDeletion, finishSurveyDeletion, removeSurveyFiles } from "@/lib/supabase/survey-deletion";
import { imageBucket, requireSurvey, supabaseRequest, surveySession, type Survey } from "@/lib/supabase/surveys";

type Result = { error?: string; success?: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";

export async function saveSurvey(_state: Result, form: FormData): Promise<Result> {
  let id = String(form.get("id") ?? "");
  try {
    const { user, token } = await surveySession();
    const name = String(form.get("name") ?? "").trim();
    const location = String(form.get("location") ?? "").trim();
    const drone = String(form.get("drone") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    const date = String(form.get("flight_date") ?? "");
    if (name.length < 2 || name.length > 120) return { error: "Informe um nome entre 2 e 120 caracteres." };
    if (location.length > 200 || drone.length > 100 || notes.length > 3000) return { error: "Um dos campos ultrapassou o limite de texto." };
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))) return { error: "Informe uma data válida." };
    const contextRaw=String(form.get("planning_context")||"null"),configRaw=String(form.get("drone_config")||"null");
    if(contextRaw.length>50000||configRaw.length>16000)throw Error("Os dados do mapa ou do drone ultrapassam o limite permitido.");
    const planning=form.has("planning_context")?validateSurveyPlanning(JSON.parse(contextRaw)):undefined;
    let config=form.has("drone_config")?validateStoredConfig(JSON.parse(configRaw)):undefined;
    if(config&&config.name!==drone)throw Error("O perfil selecionado não corresponde ao nome do drone.");
    if(config?.custom_id)config=customConfig(await readCustomDroneProfile(config.custom_id));
    const data = { name, location, drone, notes, flight_date: date || null,...(planning!==undefined?{planning_context:planning}:{}),...(config!==undefined?{drone_config:config}:{}) };
    if (id) {
      await requireSurvey(id, token);
      await supabaseRequest(`/rest/v1/surveys?id=eq.${id}`, token, { method: "PATCH", body: JSON.stringify(data) });
    } else {
      const rows = await supabaseRequest<Survey[]>("/rest/v1/surveys", token, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...data, owner_id: user.id }) });
      id = rows[0].id;
    }
  } catch (error) { return { error: errorText(error) }; }
  revalidatePath("/painel");
  if(form.get("destination")==="waypoints")redirect(`/waypoints?levantamento=${id}`);
  redirect(`/painel?levantamento=${id}`);
}

export async function prepareImageUpload(id: string, filename: string, type: string, size: number): Promise<{ url?: string; error?: string }> {
  try {
    const { user, token } = await surveySession();
    await requireSurvey(id, token);
    if (!["image/jpeg", "image/png"].includes(type) || !/\.(jpe?g|png)$/i.test(filename)) throw new Error("Envie imagens JPG ou PNG.");
    if (!Number.isFinite(size) || size <= 0 || size > 50 * 1024 * 1024) throw new Error("Cada foto deve ter no máximo 50 MB.");
    const clean = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_").slice(-150);
    const path = `${user.id}/${id}/${crypto.randomUUID()}_${clean}`;
    const response = await supabaseRequest<{ url: string }>(`/storage/v1/object/upload/sign/${imageBucket}/${path}`, token, { method: "POST", body: "{}" });
    return { url: `${getSupabaseConfig().url}/storage/v1${response.url}` };
  } catch (error) { return { error: errorText(error) }; }
}

export async function openImage(id: string, name: string): Promise<{ url?: string; error?: string }> {
  try {
    const { user, token } = await surveySession();
    await requireSurvey(id, token);
    if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) throw new Error("Arquivo inválido.");
    const path = `${user.id}/${id}/${encodeURIComponent(name)}`;
    const response = await supabaseRequest<{ signedURL: string }>(`/storage/v1/object/sign/${imageBucket}/${path}`, token, { method: "POST", body: JSON.stringify({ expiresIn: 120 }) });
    return { url: `${getSupabaseConfig().url}/storage/v1${response.signedURL}` };
  } catch (error) { return { error: errorText(error) }; }
}


export async function deleteSurvey(_state: Result, form: FormData): Promise<Result> {
  let started = false;
  try {
    const { user, token } = await surveySession();
    const id = String(form.get("id") ?? "");
    const name = String(form.get("name") ?? "");
    const manifest = await beginSurveyDeletion(id, name, token);
    started = true;
    await removeSurveyFiles(manifest, user.id, token);
    await finishSurveyDeletion(id, token);
  } catch (error) {
    if (started) revalidatePath("/painel");
    return { error: started
      ? `A exclusão não terminou. Use “Concluir exclusão” para tentar novamente. ${errorText(error)}`
      : errorText(error) };
  }
  for (const path of ["/painel", "/processamento", "/processamento/resultados", "/processamento/relatorio", "/agro", "/missoes"]) revalidatePath(path);
  redirect("/painel?apagado=1");
}

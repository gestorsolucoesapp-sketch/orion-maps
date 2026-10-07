import "server-only";

import { imageBucket, supabaseRequest } from "./surveys";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type StorageEntry = { name: string; id: string | null };
type DeletionManifest = { survey_id: string; job_ids: string[] };

async function removeFolder(bucket: string, prefix: string, token: string) {
  const folders = [prefix];
  const keys: string[] = [];
  // Finish listing before deletion so pagination cannot skip shifted objects.
  for (let index = 0; index < folders.length; index++) {
    const folder = folders[index];
    for (let offset = 0; ; offset += 200) {
      const entries = await supabaseRequest<StorageEntry[]>(`/storage/v1/object/list/${bucket}`, token, {
        method: "POST",
        body: JSON.stringify({ prefix: folder, limit: 200, offset, sortBy: { column: "name", order: "asc" } }),
      });
      for (const entry of entries) {
        if (!entry.name || entry.name === "." || entry.name === ".." || /[/\\\\]/.test(entry.name)) {
          throw new Error("Foi encontrado um caminho de arquivo inválido.");
        }
        const key = `${folder}/${entry.name}`;
        if (entry.id) keys.push(key);
        else folders.push(key);
      }
      if (entries.length < 200) break;
    }
  }
  for (let offset = 0; offset < keys.length; offset += 200) {
    await supabaseRequest(`/storage/v1/object/${bucket}`, token, {
      method: "DELETE", body: JSON.stringify({ prefixes: keys.slice(offset, offset + 200) }),
    });
  }
}

export async function beginSurveyDeletion(id: string, name: string, token: string) {
  if (!uuid.test(id) || name.length < 2 || name.length > 120) {
    throw new Error("Levantamento inválido. Atualize o painel e tente novamente.");
  }
  const manifest = await supabaseRequest<DeletionManifest>("/rest/v1/rpc/begin_survey_deletion", token, {
    method: "POST", body: JSON.stringify({ p_survey_id: id, p_name: name }),
  });
  if (manifest.survey_id !== id || !Array.isArray(manifest.job_ids) || !manifest.job_ids.every(jobId => uuid.test(jobId))) {
    throw new Error("Não foi possível verificar os arquivos deste levantamento.");
  }
  return manifest;
}

export async function removeSurveyFiles(manifest: DeletionManifest, userId: string, token: string) {
  if (!uuid.test(userId)) throw new Error("Sessão inválida.");
  await removeFolder(imageBucket, `${userId}/${manifest.survey_id}`, token);
  // Processing outputs are grouped by job, not by survey; include every attempt.
  for (const jobId of new Set(manifest.job_ids)) {
    await removeFolder("processing-results", `${userId}/${jobId}`, token);
  }
}

export async function finishSurveyDeletion(id: string, token: string) {
  await supabaseRequest("/rest/v1/rpc/finish_survey_deletion", token, {
    method: "POST", body: JSON.stringify({ p_survey_id: id }),
  });
}

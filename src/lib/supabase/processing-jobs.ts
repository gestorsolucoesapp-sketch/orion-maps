import { supabaseRequest } from "./surveys";

export type ProcessingJob = {
  id: string;
  survey_id: string;
  status: "queued"|"claimed"|"downloading"|"validating"|"processing"|"derivatives"|"uploading"|"completed"|"error"|"cancelled";
  progress: number;
  stage: string;
  message: string;
  config: Record<string, unknown>;
  input_image_count: number;
  engine: string;
  engine_task_uuid: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error_detail: string | null;
};

export async function listProcessingJobs(surveyId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(surveyId)) throw new Error("Levantamento inválido.");
  const select = "id,survey_id,status,progress,stage,message,config,input_image_count,engine,engine_task_uuid,created_at,updated_at,completed_at,error_detail";
  return supabaseRequest<ProcessingJob[]>(
    `/rest/v1/processing_jobs?survey_id=eq.${surveyId}&select=${select}&order=created_at.desc&limit=20`,
    token
  );
}

export async function createProcessingJob(
  token: string,
  input: {
    survey_id: string;
    input_image_count: number;
    config: Record<string, unknown>;
  }
) {
  const rows = await supabaseRequest<ProcessingJob[]>("/rest/v1/processing_jobs?select=*", token, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      survey_id: input.survey_id,
      input_image_count: input.input_image_count,
      config: input.config,
      status: "queued",
      progress: 0,
      stage: "queued",
      message: "Aguardando o processador local Orion Maps.",
      engine: "nodeodm",
    }),
  });
  if (!rows[0]) throw new Error("A tarefa não foi criada.");
  return rows[0];
}

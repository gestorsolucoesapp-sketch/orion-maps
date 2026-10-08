"use server";
import {surveySession, requireSurvey, supabaseRequest} from "@/lib/supabase/surveys";
import {validateAgroPlan, calculateAgroPlan, type AgroPlan} from "@/lib/agro-plan";

export type AgroSaved = {id:string; name:string; survey_id:string|null; created_at:string; summary:Record<string,unknown>};
const uuid=(id:unknown):id is string=>typeof id==="string"&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const friendly=(e:unknown)=>e instanceof Error?e.message:"Não foi possível acessar os planos agrícolas.";
export async function listAgroPlans(){
 try{
  const {token}=await surveySession();
  const listed=await supabaseRequest<(AgroSaved&{survey:{deletion_requested_at:string|null}|null})[]>("/rest/v1/agro_plans?select=id,name,survey_id,created_at,summary,survey:surveys(deletion_requested_at)&order=created_at.desc&limit=50",token);
  const rows=listed.flatMap(({survey,...row})=>row.survey_id===null||survey?.deletion_requested_at===null?[row]:[]);
  return {rows,error:""};
 }catch(e){return {rows:[] as AgroSaved[],error:friendly(e)};}
}
export async function loadAgroPlan(id:string){
 try{
  const {token}=await surveySession();if(!uuid(id))throw Error("Plano inválido.");
  const rows=await supabaseRequest<(AgroSaved&{plan:AgroPlan})[]>(`/rest/v1/agro_plans?id=eq.${id}&select=id,name,survey_id,plan,created_at,summary&limit=1`,token);
  if(!rows[0])throw Error("Plano não encontrado ou sem acesso.");
  if(rows[0].survey_id)await requireSurvey(rows[0].survey_id,token);
  const plan=validateAgroPlan(rows[0].plan);calculateAgroPlan(plan);
  return {row:{...rows[0],plan},error:""};
 }catch(e){return {row:null,error:friendly(e)};}
}
export async function saveAgroPlan(request:{id:string;name:string;survey_id:string|null;plan:unknown}){
 try{
  const {user,token}=await surveySession();
  if(!request||!uuid(request.id)||typeof request.name!=="string"||!request.name.trim()||request.name.length>120)throw Error("Informe um nome de até 120 caracteres para o talhão.");
  if(request.survey_id!==null){if(!uuid(request.survey_id))throw Error("Levantamento inválido.");await requireSurvey(request.survey_id,token);}
  const plan=validateAgroPlan(request.plan),calculation=calculateAgroPlan(plan);
  const summary={schema_version:1,mode:plan.settings.mode,rows:calculation.rows.length,area_m2:calculation.area_m2,usable_area_m2:calculation.usable_area_m2,length_m:calculation.length_m,crs:calculation.epsg,simulation_only:true};
  const body={id:request.id,owner_id:user.id,survey_id:request.survey_id,name:request.name.trim(),plan,summary};
  const rows=await supabaseRequest<AgroSaved[]>("/rest/v1/agro_plans?on_conflict=id&select=id,name,survey_id,created_at,summary",token,{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify(body)});
  if(rows[0])return {row:rows[0],error:""};
  const old=await loadAgroPlan(request.id);
  if(!old.row||old.row.name!==body.name||old.row.survey_id!==body.survey_id||JSON.stringify(validateAgroPlan(old.row.plan))!==JSON.stringify(plan))throw Error("Esta solicitação já corresponde a outro conteúdo. Reabra a versão e salve uma nova cópia.");
  const {plan:ignored,...row}=old.row;void ignored;
  return {row,error:""};
 }catch(e){return {row:null,error:friendly(e)};}
}

import {listProcessingResults} from "@/lib/supabase/processing-results";
import {listProcessingJobs} from "@/lib/supabase/processing-jobs";
import {selectAgroPreview} from "@/lib/agro-preview";
export type {AgroPreview} from "@/lib/agro-preview";
export async function loadAgroPreview(surveyId:string,jobId?:string|null){
 try{
  const {token}=await surveySession();await requireSurvey(surveyId,token);
  if(jobId&&!uuid(jobId))throw Error("Processamento inválido.");
  const [jobs,results]=await Promise.all([listProcessingJobs(surveyId,token),listProcessingResults(surveyId,token)]);
  const preview=selectAgroPreview(surveyId,jobs,results,jobId);
  if(preview)return {preview,error:""};
  return {preview:null,error:jobId?"A ortofoto deste processamento não está disponível. O resultado original não foi alterado.":"Ainda não há ortofoto concluída para este levantamento. O mapa-base pode ser usado para planejamento preliminar."};
 }catch(e){return {preview:null,error:friendly(e)};}
}

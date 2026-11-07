"use server";

import {EMPTY_SURVEY_PLANNING,validateSurveyPlanning,type VisualReferencePoint} from "@/lib/survey-planning";
import {requireSurvey,supabaseRequest,surveySession,type Survey} from "@/lib/supabase/surveys";

export async function changeResultReference(surveyId:string,change:{kind:"add";point:[number,number]}|{kind:"remove";id:string}):Promise<VisualReferencePoint[]>{
  const {user,token}=await surveySession();
  const survey=await requireSurvey(surveyId,token);
  const planning=survey.planning_context??EMPTY_SURVEY_PLANNING;
  const current=planning.reference_points??[];
  let next:VisualReferencePoint[];
  if(change.kind==="add"){
    const [lng,lat]=change.point;
    if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>85)throw new Error("Posição da cruz inválida.");
    if(current.length>=6)throw new Error("Use até 6 cruzes de referência.");
    next=[...current,{id:crypto.randomUUID(),point:[lng,lat]}];
  }else{
    if(!current.some(ref=>ref.id===change.id))throw new Error("Esta cruz já foi removida. Atualize a página.");
    next=current.filter(ref=>ref.id!==change.id);
  }
  const updated={...planning,reference_points:next};
  validateSurveyPlanning(updated);
  const rows=await supabaseRequest<Pick<Survey,"planning_context">[]>(`/rest/v1/surveys?id=eq.${surveyId}&owner_id=eq.${user.id}&select=planning_context`,token,{
    method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({planning_context:updated}),
  });
  if(rows.length!==1)throw new Error("Não foi possível salvar a cruz neste levantamento.");
  return rows[0].planning_context?.reference_points??[];
}

"use server";
import {surveySession,requireSurvey} from "@/lib/supabase/surveys";
import {catalogueConfig,EMPTY_SURVEY_PLANNING,validateStoredConfig,validateSurveyPlanning} from "@/lib/survey-planning";
import {listCustomDroneProfiles} from "../painel/drone-actions";
/** Read only. Importing a survey context never saves a mission or queues a controller transfer. */
export async function getSurveyPlanningContext(id:string){
 try{
  const {token}=await surveySession(),survey=await requireSurvey(id,token),registered=await listCustomDroneProfiles();
  const planning=survey.planning_context?validateSurveyPlanning(survey.planning_context):EMPTY_SURVEY_PLANNING;
  const config=validateStoredConfig(survey.drone_config)||catalogueConfig(survey.drone);
  return {context:{id:survey.id,name:survey.name,location:survey.location,drone:survey.drone,config,planning,registered:registered.rows},error:""};
 }catch(e){return {context:null,error:e instanceof Error?e.message:"Não foi possível abrir o levantamento no planejador."};}
}

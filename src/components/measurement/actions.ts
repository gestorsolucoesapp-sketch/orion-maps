"use server";
import {surveySession,supabaseRequest,requireSurvey} from "@/lib/supabase/surveys";
import {requireMeasurement,measureDrawing,MEASUREMENT_METHOD,type Measurement} from "@/lib/map-measurement";
const validId=(id:unknown):id is string=>typeof id==="string"&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
export type MeasurementImageSource="satellite_reference"|"orthophoto";
export type SavedMeasurement={id:string;name:string;survey_id:string|null;measurement:Measurement;created_at:string;image_source:MeasurementImageSource|null};
type StoredMeasurement=Omit<SavedMeasurement,"image_source">&{metrics?:{image_source?:unknown}};
const imageSource=(value:unknown):MeasurementImageSource|null=>value==="satellite_reference"||value==="orthophoto"?value:null;
export async function saveMeasurement(input:{id:string;name:string;survey_id:string|null;measurement:unknown;image_source?:MeasurementImageSource|null}){
 try{
  const {user,token}=await surveySession();
  if(!validId(input.id)||typeof input.name!=="string"||!input.name.trim()||input.name.length>120)throw Error("Informe um nome de até 120 caracteres.");
  if(input.survey_id!==null){if(!validId(input.survey_id))throw Error("Projeto inválido.");await requireSurvey(input.survey_id,token);}
  if(input.image_source!==undefined&&input.image_source!==null&&!imageSource(input.image_source))throw Error("Fonte da medição inválida.");
  const source=imageSource(input.image_source);
  const measurement=requireMeasurement(input.measurement),metrics=measureDrawing(measurement);
  if(source&&(!input.survey_id||measurement.kind!=="polygon"))throw Error("A fonte visual só pode acompanhar uma área salva no projeto.");
  const row={id:input.id,owner_id:user.id,name:input.name.trim(),survey_id:input.survey_id,measurement,metrics:{...metrics,method:MEASUREMENT_METHOD,image_source:source,manual_adjusted:measurement.manual_adjusted===true}};
  await supabaseRequest("/rest/v1/map_measurements?on_conflict=id",token,{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify(row)});
  const saved=await supabaseRequest<StoredMeasurement[]>(`/rest/v1/map_measurements?id=eq.${input.id}&select=id,name,survey_id,measurement,metrics,created_at`,token);
  if(!saved[0]||saved[0].name!==row.name||saved[0].survey_id!==row.survey_id||imageSource(saved[0].metrics?.image_source)!==source||JSON.stringify(requireMeasurement(saved[0].measurement))!==JSON.stringify(measurement))throw Error("A gravação não pôde ser confirmada. Preserve o desenho e tente novamente.");
  return {error:"",saved:{...saved[0],measurement:requireMeasurement(saved[0].measurement),image_source:source}};
 }catch(e){return {error:e instanceof Error?e.message:"Não foi possível salvar. Seu desenho foi mantido.",saved:null};}
}
export async function listMeasurements(surveyId:string|null){
 try{const {token}=await surveySession();if(surveyId!==null){if(!validId(surveyId))throw Error("Projeto inválido.");await requireSurvey(surveyId,token);}
  const scope=surveyId?`&survey_id=eq.${surveyId}`:"";
  const rows=await supabaseRequest<StoredMeasurement[]>(`/rest/v1/map_measurements?select=id,name,survey_id,measurement,metrics,created_at${scope}&order=created_at.desc&limit=100`,token);
  return {rows:rows.map(r=>({...r,measurement:requireMeasurement(r.measurement),image_source:imageSource(r.metrics?.image_source)})),error:""};
 }catch(e){return {rows:[],error:e instanceof Error?e.message:"Não foi possível abrir as medições."};}
}

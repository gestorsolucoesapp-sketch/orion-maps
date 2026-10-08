"use client";
import {useActionState,useId,useState} from "react";
import type {Survey} from "@/lib/supabase/surveys";
import {catalogueConfig,EMPTY_SURVEY_PLANNING,SUGGESTED_DRONE,validateStoredConfig,validateSurveyPlanning,type SurveyDroneConfig} from "@/lib/survey-planning";
import CityMapPreview from "./city-map-preview";
import DroneSelector from "./drone-selector";
import {saveSurvey} from "./survey-actions";
const input="mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
function initialDrone(survey?:Survey):SurveyDroneConfig{
 if(!survey)return catalogueConfig(SUGGESTED_DRONE)!;
 try{const config=validateStoredConfig(survey.drone_config);if(config)return config;}catch{}
 return catalogueConfig(survey.drone)||{version:1,name:survey.drone||"",camera:null,custom_id:null,source:"",features:""};
}
export default function SurveyForm({survey}:{survey?:Survey}){
 const [state,action,pending]=useActionState(saveSurvey,{}),formId=useId();
 const [name,setName]=useState(survey?.name||""),[city,setCity]=useState(survey?.location||""),[date,setDate]=useState(survey?.flight_date||""),[notes,setNotes]=useState(survey?.notes||"");
 const [drone,setDrone]=useState(()=>initialDrone(survey)),[planning,setPlanning]=useState(()=>{try{return survey?.planning_context?validateSurveyPlanning(survey.planning_context):EMPTY_SURVEY_PLANNING;}catch{return EMPTY_SURVEY_PLANNING;}});
 // External form association keeps map/help/profile buttons completely outside the survey form.
 return <div className="min-w-0 space-y-5" data-testid="survey-form">
  <form id={formId} action={action}><input type="hidden" name="id" value={survey?.id||""}/><input type="hidden" name="planning_context" value={JSON.stringify(planning)}/></form>
  <label className="block text-sm font-semibold">Nome do levantamento<input form={formId} className={input} name="name" required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
  <div className="grid min-w-0 gap-5 sm:grid-cols-2"><label className="block min-w-0 text-sm font-semibold">Local<input form={formId} className={input} name="location" maxLength={200} value={city} onChange={e=>setCity(e.target.value)} placeholder="Município - UF"/></label><label className="block min-w-0 text-sm font-semibold">Data do voo<input form={formId} className={input} name="flight_date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
  <CityMapPreview city={city} value={planning} onChange={setPlanning}/>
  <DroneSelector value={drone} onChange={setDrone} formId={formId}/>
  <label className="block text-sm font-semibold">Anotações<textarea form={formId} className={input} name="notes" rows={3} maxLength={3000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  {state.error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
  <div className="flex flex-wrap gap-2"><button type="submit" form={formId} disabled={pending} aria-busy={pending} className="min-h-11 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending?"Salvando…":survey?"Salvar alterações":"Criar levantamento"}</button><button type="submit" form={formId} name="destination" value="waypoints" disabled={pending} className="min-h-11 rounded-xl border border-emerald-800 bg-white px-5 py-3 text-sm font-semibold text-emerald-900 disabled:opacity-50">Salvar e planejar voo →</button></div>
 </div>;
}

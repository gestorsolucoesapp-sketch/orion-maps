"use client";
import dynamic from "next/dynamic";
import {useCallback,useEffect,useRef,useState} from "react";
import type {SurveyPlanning} from "@/lib/survey-planning";
import type {ImportedMapLocation} from "@/lib/google-maps-location";
import type {CityPlace} from "./survey-map-canvas";
const SurveyMapCanvas=dynamic(()=>import("./survey-map-canvas"),{ssr:false,loading:()=> <div className="grid min-h-96 place-items-center rounded-2xl bg-slate-50 text-sm" role="status">Preparando mapa…</div>});
export default function CityMapPreview({city,value,onChange}:{city:string;value:SurveyPlanning;onChange:(value:SurveyPlanning)=>void}){
 const [place,setPlace]=useState<CityPlace|null>(()=>value.importedLocation?{...value.importedLocation,query:city.trim(),source:"google-maps",restore:true}:null),[status,setStatus]=useState(""),[error,setError]=useState("");
 const initial=useRef(true),saved=useRef(value),latest=useRef({value,onChange,city}),requests=useRef<{sequence:number;controller:AbortController|null;timer:ReturnType<typeof setTimeout>|null}>({sequence:0,controller:null,timer:null});
 useEffect(()=>{latest.current={value,onChange,city};});
 const importPoint=useCallback((point:ImportedMapLocation)=>{
  const r=requests.current;r.sequence++;r.controller?.abort();if(r.timer)clearTimeout(r.timer);r.timer=null;
  const c=latest.current;setStatus("");setError("");setPlace({...point,query:c.city.trim(),source:"google-maps"});
  c.onChange({...c.value,center:[point.lon,point.lat],zoom:point.zoom,cityQuery:c.city.trim(),importedLocation:{...point}});
 },[]);
 useEffect(()=>{
  const query=city.trim(),skip=initial.current&&!!saved.current.center&&saved.current.cityQuery===query;initial.current=false;if(skip)return;
  const request=requests.current,sequence=++request.sequence;request.controller?.abort();if(request.timer)clearTimeout(request.timer);const controller=new AbortController();request.controller=controller;
  setError("");setStatus("");setPlace(null);
  if(query.length<3)return()=>{controller.abort();};
  request.timer=setTimeout(async()=>{
   setStatus("Localizando…");
   try{
    const response=await fetch(`/api/city-location?q=${encodeURIComponent(query)}`,{signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(result.error||"Cidade não encontrada.");
    if(typeof result.lat!=="number"||typeof result.lon!=="number"||!Number.isFinite(result.lat)||!Number.isFinite(result.lon)||Math.abs(result.lat)>80||Math.abs(result.lon)>180||typeof result.label!=="string")throw Error("Coordenadas da cidade inválidas.");
    if(!controller.signal.aborted&&sequence===request.sequence){setPlace({lat:result.lat,lon:result.lon,label:result.label,query});setStatus("");const current=latest.current;if(current.value.importedLocation)current.onChange({...current.value,importedLocation:null});}
   }catch(e){if(!controller.signal.aborted&&sequence===request.sequence){setError(e instanceof Error?e.message:"Falha ao localizar a cidade.");setStatus("");}}
  },1000);
  return()=>{if(request.timer)clearTimeout(request.timer);controller.abort();};
 },[city]);
 return <SurveyMapCanvas city={city} value={value} onChange={onChange} onImport={importPoint} place={place} status={status} error={error}/>;
}

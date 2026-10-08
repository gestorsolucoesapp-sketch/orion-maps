"use client";
import dynamic from "next/dynamic";
import {useEffect,useRef,useState} from "react";
import type {SurveyPlanning} from "@/lib/survey-planning";
import type {CityPlace} from "./survey-map-canvas";
const SurveyMapCanvas=dynamic(()=>import("./survey-map-canvas"),{ssr:false,loading:()=> <div className="grid min-h-96 place-items-center rounded-2xl bg-slate-50 text-sm" role="status">Preparando mapa…</div>});
export default function CityMapPreview({city,value,onChange}:{city:string;value:SurveyPlanning;onChange:(value:SurveyPlanning)=>void}){
 const [place,setPlace]=useState<CityPlace|null>(null),[status,setStatus]=useState(""),[error,setError]=useState("");
 const initial=useRef(true),saved=useRef(value);
 useEffect(()=>{
  const query=city.trim(),skip=initial.current&&!!saved.current.center&&saved.current.cityQuery===query;initial.current=false;
  if(skip)return;
  const controller=new AbortController();
  setError("");setStatus("");setPlace(null);
  if(query.length<3)return;
  const timer=setTimeout(async()=>{
   setStatus("Localizando…");
   try{
    const response=await fetch(`/api/city-location?q=${encodeURIComponent(query)}`,{signal:controller.signal});
    const result=await response.json();if(!response.ok)throw Error(result.error||"Cidade não encontrada.");
    if(typeof result.lat!=="number"||typeof result.lon!=="number"||!Number.isFinite(result.lat)||!Number.isFinite(result.lon)||Math.abs(result.lat)>80||Math.abs(result.lon)>180||typeof result.label!=="string")throw Error("Coordenadas da cidade inválidas.");
    if(!controller.signal.aborted){setPlace({lat:result.lat,lon:result.lon,label:result.label,query});setStatus("");}
   }catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:"Falha ao localizar a cidade.");setStatus("");}}
  },1000);
  return()=>{clearTimeout(timer);controller.abort();};
 },[city]);
 return <SurveyMapCanvas city={city} value={value} onChange={onChange} place={place} status={status} error={error}/>;
}

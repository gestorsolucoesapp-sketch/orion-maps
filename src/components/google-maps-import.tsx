"use client";
import dynamic from "next/dynamic";
import {useEffect,useId,useRef,useState} from "react";
import InfoPopover from "./info-popover";
import {MAX_MAP_LINK_LENGTH,locationPoint,parseGoogleMapsLocation,type ImportedMapLocation} from "@/lib/google-maps-location";
import "./google-maps-import.css";
const LocationPreviewMap=dynamic(()=>import("./location-preview-map"),{ssr:false,loading:()=> <div className="maps-import-preview maps-import-loading" role="status">Preparando conferência…</div>});
export default function GoogleMapsImport({onApply,disabled=false,maxLatitude=80}:{onApply:(p:ImportedMapLocation)=>void;disabled?:boolean;maxLatitude?:number}){
 const [open,setOpen]=useState(false),[input,setInput]=useState(""),[candidate,setCandidate]=useState<ImportedMapLocation|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const id=useId(),request=useRef<{sequence:number;controller:AbortController|null}>({sequence:0,controller:null}),field=useRef<HTMLInputElement>(null);
 useEffect(()=>{const state=request.current;return()=>{state.sequence++;state.controller?.abort();};},[]);
 function cancel(){request.current.sequence++;request.current.controller?.abort();request.current.controller=null;setBusy(false);}
 function close(){cancel();setOpen(false);setCandidate(null);setError("");}
 function edit(value:string){cancel();setInput(value);setCandidate(null);setError("");setMessage("");}
 async function locate(){
  cancel();setCandidate(null);setError("");setMessage("");const seq=++request.current.sequence,controller=new AbortController();request.current.controller=controller;setBusy(true);
  try{
   let point=parseGoogleMapsLocation(input);
   if(!point){const timeout=setTimeout(()=>controller.abort(),14000);try{
    const response=await fetch("/api/maps-location",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({input}),credentials:"same-origin",cache:"no-store",signal:controller.signal});
    const data=await response.json();if(!response.ok)throw Error(data.error||"Não foi possível resolver o link.");point=data.location;
   }finally{clearTimeout(timeout);}}
   if(!point||typeof point.lat!=="number"||typeof point.lon!=="number"||typeof point.label!=="string"||!["pin","view","coordinates"].includes(point.kind)||typeof point.zoom!=="number"||!Number.isFinite(point.zoom))throw Error("O link não retornou uma localização válida.");
   locationPoint(point.lat,point.lon);if(Math.abs(point.lat)>maxLatitude)throw Error(`Esta área de trabalho suporta latitudes até ${maxLatitude}° norte ou sul.`);
   if(seq===request.current.sequence)setCandidate({...point,label:point.label.slice(0,160),zoom:Math.max(0,Math.min(21,point.zoom))});
  }catch(e){if(seq===request.current.sequence)setError(controller.signal.aborted?"A consulta demorou demais. Tente novamente ou cole o link completo.":e instanceof Error?e.message:"Falha ao importar a localização.");}
  finally{if(seq===request.current.sequence){setBusy(false);request.current.controller=null;}}
 }
 async function paste(){const seq=request.current.sequence;try{const value=await navigator.clipboard.readText();if(seq!==request.current.sequence)return;edit(value);field.current?.focus();}catch{setError("Toque no campo e use Colar para inserir o link.");field.current?.focus();}}
 return <section className="maps-location-import" data-testid="google-maps-import">
  <div className="maps-import-heading"><button type="button" className="maps-import-toggle" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={()=>{if(open)close();else{setOpen(true);setMessage("");}}}><span aria-hidden="true">⌖</span> Importar do Google Maps</button><InfoPopover title="Importar localização do Google Maps"><p>Copie o link de um ponto compartilhado no Google Maps, cole aqui e toque em Localizar. Confira o marcador e use Aplicar localização.</p><p>Aceita links completos, links curtos que redirecionam para coordenadas e latitude/longitude. Links que contêm apenas um nome, uma rota ou um identificador de lugar podem exigir que você abra o ponto no Google Maps e copie suas coordenadas.</p><p>Quando o link contém somente o centro da visualização, isso é indicado antes de aplicar. O ponto não define limites do terreno, não altera a rota e não é uma medição GPS.</p><p>A importação posiciona o mapa do Orion; não importa imagens ou camadas do Google Maps. Os contornos, medições, câmera e demais campos são preservados. Links curtos são consultados pela sua conta, sem enviar credenciais ao Google.</p></InfoPopover></div>
  {open&&<div id={id} className="maps-import-panel"><label htmlFor={id+"-link"}>Link ou coordenadas</label><div className="maps-import-input-row"><input ref={field} id={id+"-link"} aria-label="Link do Google Maps ou coordenadas" type="text" inputMode="text" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={MAX_MAP_LINK_LENGTH} value={input} placeholder="Cole o link compartilhado" onChange={e=>edit(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void locate();}}}/><button type="button" aria-label="Colar link do Google Maps" onClick={()=>void paste()}>Colar</button></div>
   <div className="maps-import-actions"><button type="button" className="maps-import-primary" disabled={busy||!input.trim()} aria-busy={busy} onClick={()=>void locate()}>{busy?"Localizando…":"Localizar"}</button><button type="button" onClick={close}>Cancelar</button></div>
   {error&&<p role="alert" className="maps-import-error">{error}</p>}
   {candidate&&<div className="maps-import-candidate" data-testid="maps-import-candidate"><div className="maps-import-coordinates"><strong>{candidate.label}</strong><span>{candidate.lat.toFixed(7)}, {candidate.lon.toFixed(7)}</span><small>{candidate.kind==="view"?"Centro da visualização · não é um marcador":candidate.kind==="coordinates"?"Coordenadas informadas":"Marcador do Google Maps"}</small></div><LocationPreviewMap location={candidate}/><button type="button" className="maps-import-primary maps-import-apply" disabled={disabled} onClick={()=>{onApply(candidate);close();setMessage("Localização aplicada ao mapa.");}}>Aplicar localização</button></div>}
  </div>}
  {message&&<p role="status" className="maps-import-success">{message}</p>}
 </section>;
}

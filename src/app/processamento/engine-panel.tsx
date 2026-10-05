"use client";

import {useMemo,useState} from "react";
import {checkProcessingEngine} from "./engine-actions";
import type {EngineStatus} from "./engine-client";
import type {ProcessingDevice} from "@/lib/supabase/processing-devices";

type Props={devices:ProcessingDevice[];error?:string};

export default function EnginePanel({devices,error}:Props){
 const [status,setStatus]=useState<EngineStatus|null>(null),[busy,setBusy]=useState(false);
 const live=useMemo(()=>devices.find(d=>{
  if(!d.enabled||!d.last_seen)return false;
  return Date.now()-new Date(d.last_seen).getTime()<90_000;
 }),[devices]);
 async function check(){
  setBusy(true);
  try{setStatus(await checkProcessingEngine());}
  catch{setStatus({state:"unavailable",message:"Não foi possível verificar o motor configurado neste ambiente."});}
  finally{setBusy(false);}
 }
 return <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <strong>Fila de processamento local</strong>
    <p className="mt-1 text-sm text-slate-600">{live?"Processador online · "+live.name:"Fila web habilitada · aguardando agente local"}</p>
   </div>
   <div className="flex items-center gap-2">
    <span className={"rounded-full px-3 py-1 text-xs font-semibold "+(live?"bg-emerald-700 text-white":"bg-amber-100 text-amber-900")}>{live?"ONLINE":"OFFLINE"}</span>
    <button type="button" disabled={busy} onClick={check} className="rounded-lg border border-emerald-700 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 disabled:opacity-50">{busy?"Verificando…":"Verificar motor configurado"}</button>
   </div>
  </div>
  {error&&<p role="alert" className="mt-3 text-sm text-amber-900">{error}</p>}
  <p role="status" className="mt-3 text-sm">{status?.message||(live?"Seu PC está conectado à fila privada e pode receber novos processamentos.":"Ao clicar em Iniciar processamento, a tarefa entra na fila privada e aguarda o agente instalado no seu PC.")}</p>
  <p className="mt-2 text-xs text-slate-600">Fluxo: criar tarefa → agente local baixa as fotos → NodeODM/PDAL/GDAL processam → resultados retornam ao Orion Maps.</p>
 </section>;
}

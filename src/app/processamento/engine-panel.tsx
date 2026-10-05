"use client";
import {useState} from "react";
import {checkProcessingEngine} from "./engine-actions";
import type {EngineStatus} from "./engine-client";

export default function EnginePanel(){
 const [status,setStatus]=useState<EngineStatus|null>(null),[busy,setBusy]=useState(false);
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
    <p className="mt-1 text-sm text-slate-600">Fila web habilitada · execução pesada no processador local Orion Maps</p>
   </div>
   <button type="button" disabled={busy} onClick={check} className="rounded-lg border border-emerald-700 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 disabled:opacity-50">{busy?"Verificando…":"Verificar motor configurado"}</button>
  </div>
  <p role="status" className="mt-3 text-sm">{status?.message||"Ao clicar em Iniciar processamento, a tarefa entra na fila privada. O agente no seu PC coleta a tarefa quando estiver online."}</p>
  <p className="mt-2 text-xs text-slate-600">Fluxo: criar tarefa → agente local baixa as fotos → NodeODM/PDAL/GDAL processam → resultados retornam ao Orion Maps.</p>
 </section>;
}

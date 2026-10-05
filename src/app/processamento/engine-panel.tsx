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

  return <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
      <div className={"grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg "+(live?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800")}>◉</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm text-slate-900">Motor de fotogrametria</strong>
          <span className={"rounded-full px-2.5 py-1 text-[10px] font-bold "+(live?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800")}>{live?"ONLINE":"OFFLINE"}</span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{live?"Processador conectado · "+live.name:"Processador local não conectado"}</p>
      </div>
      <details className="group relative ml-auto">
        <summary className="list-none cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">Detalhes</summary>
        <div className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 sm:absolute sm:right-0 sm:z-20 sm:w-[420px] sm:shadow-xl">
          {error&&<p role="alert" className="mb-2 text-amber-800">{error}</p>}
          <p role="status">{status?.message||(live?"Seu processador local está conectado e pronto para receber tarefas.":"Ao iniciar um processamento, a tarefa entra na fila e aguarda o agente local.")}</p>
          <button type="button" disabled={busy} onClick={check} className="mt-3 rounded-lg border border-emerald-700 bg-white px-3 py-2 font-semibold text-emerald-900 disabled:opacity-50">{busy?"Verificando…":"Verificar conexão"}</button>
        </div>
      </details>
    </div>
  </section>;
}

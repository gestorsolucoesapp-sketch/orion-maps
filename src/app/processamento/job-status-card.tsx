"use client";
import {useEffect,useState} from "react";
import ActivityPanel from "./activity-panel";
import {activityFresh} from "@/lib/processing-activity";
import type {ProcessingJob} from "@/lib/supabase/processing-jobs";

const labels:Record<string,string>={queued:"Na fila",claimed:"Preparando",downloading:"Baixando fotos",validating:"Validando fotos",processing:"Processando",derivatives:"Gerando produtos",uploading:"Enviando resultados",completed:"Concluído",error:"Interrompido",cancelled:"Cancelado"};
export default function JobStatusCard({job,featured=false}:{job:ProcessingJob;featured?:boolean}){
  const [now,setNow]=useState(0);
  const live=!["completed","error","cancelled"].includes(job.status);
  useEffect(()=>{
    if(!live)return;
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[live]);
  const beat=Date.parse(job.heartbeat_at||job.updated_at);
  const stale=live&&now>0&&(!Number.isFinite(beat)||now-beat>90000);
  const progress=Math.max(0,Math.min(100,Number(job.progress)||0));
  const date=(value:string)=>new Date(value).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",hour12:false});
  const started=Date.parse(job.started_at||job.created_at);
  const seconds=now>0?Math.max(0,Math.floor((now-started)/1000)):null;
  const elapsed=seconds===null?"—":`${Math.floor(seconds/60)} min ${seconds%60} s`;
  const failed=job.status==="error";
  const measured=activityFresh(job.activity,job.engine_task_uuid,now);
  const message=measured&&job.stage==="nodeodm"&&job.activity?.phase?job.activity.phase:job.message;
  const tone=failed?"border-red-200 bg-red-50/50":stale?"border-amber-300 bg-amber-50":"border-emerald-200 bg-white";
  return <article className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${tone} ${featured?"mb-5 shadow-sm":""}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold text-slate-900">{featured?"Processamento em andamento":date(job.created_at)}</h3>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${failed?"bg-red-100 text-red-800":stale?"bg-amber-100 text-amber-900":"bg-emerald-50 text-emerald-900"}`}>{stale?"Sem atualização recente":labels[job.status]||job.status}</span>
    </div>
    <div className="mt-4 flex items-baseline justify-between gap-3"><span className="text-xs text-slate-500">{live?"Andamento por etapas":"Último progresso registrado"}</span><strong className="text-2xl tabular-nums">{progress}%</strong></div>
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Andamento por etapas">
      <div style={{width:`${progress}%`}} className={`h-full rounded-full transition-[width] duration-700 ${failed?"bg-red-600":stale?"bg-amber-500":"bg-emerald-800"}`}/>
    </div>
    <p className="mt-3 break-words text-sm leading-6 text-slate-700">{failed?"O processamento foi interrompido. Consulte o diagnóstico abaixo.":message||labels[job.status]}</p>
    {live&&<p className="mt-2 text-xs leading-5 text-slate-500">O percentual é fornecido por etapas, não pelo tempo. O painel abaixo separa uso de recursos de avanços efetivamente registrados pelo motor.</p>}
    {live&&<ActivityPanel sample={job.activity} taskId={job.engine_task_uuid} now={now}/>}
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
      {live&&<span>Tempo decorrido: <b className="font-medium tabular-nums">{elapsed}</b></span>}
      <span>Último sinal: {date(job.heartbeat_at||job.updated_at)}</span>
      {job.input_image_count>0&&<span>{job.input_image_count} fotos</span>}
    </div>
    {stale&&<p role="alert" className="mt-3 text-sm text-amber-900">A comunicação está atrasada. Isso não confirma que o cálculo parou. Não inicie outra tarefa.</p>}
    <details className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
      <summary className="cursor-pointer font-semibold">Detalhes técnicos</summary>
      <p className="mt-2 break-all">Tarefa: {job.id}</p><p className="mt-1 break-all">Motor: {job.engine_task_uuid||"Ainda não criado"}</p>
      <p className="mt-1">Etapa registrada: {job.stage}</p>
      {job.error_detail&&<pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-3 text-red-900">{job.error_detail}</pre>}
    </details>
  </article>;
}

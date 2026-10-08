"use client";
import LiveProcessingRefresh from "@/components/live-processing-refresh";
import JobStatusCard from "./job-status-card";
import EnginePanel from './engine-panel';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {Survey,SurveyImage} from '@/lib/supabase/surveys';
import {ImageWorkspace} from '../painel/workspace';
import {products,readDrafts,validateDraft,type Draft} from './drafts';
import type {ProcessingJob} from '@/lib/supabase/processing-jobs';
import type {ProcessingDevice} from '@/lib/supabase/processing-devices';
import {queueProcessing} from './job-actions';

const card='min-w-0 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7';
const field='mt-2 block w-full rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-sm text-slate-800';
const button='rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';
type Props={userId:string;surveys:Survey[];active?:Survey;images:SurveyImage[];imageError?:string;jobs:ProcessingJob[];jobsError?:string;devices:ProcessingDevice[];devicesError?:string;draftId?:string};
export default function ProcessingWorkspace({userId,surveys,active,images,imageError,jobs,jobsError,devices,devicesError,draftId}:Props){
 const router=useRouter(),storageKey=`orion-processing-v1:${userId}`;
 const [drafts,setDrafts]=useState<Draft[]>([]),[message,setMessage]=useState(''),[storageReady,setStorageReady]=useState(false),[queueBusy,setQueueBusy]=useState(false);
 const [id,setId]=useState(''),[title,setTitle]=useState(active?.name||''),[product,setProduct]=useState('complete'),[quality,setQuality]=useState('medium'),[resolution,setResolution]=useState('5'),[gcp,setGcp]=useState(false),[notes,setNotes]=useState('');
 function fill(d:Draft){setId(d.id);setTitle(d.title);setProduct(d.product);setQuality(d.quality);setResolution(String(d.resolution));setGcp(d.gcp);setNotes(d.notes);}
 useEffect(()=>{
  try{const saved=readDrafts(localStorage.getItem(storageKey));
   // Restore browser-only drafts after hydration; never write storage during restoration.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   setDrafts(saved);setStorageReady(true);
   if(draftId){const found=saved.find(d=>d.id===draftId&&d.surveyId===active?.id);if(found)fill(found);else setMessage('Rascunho não encontrado neste navegador.');}
  }catch{setMessage('Não foi possível ler os rascunhos deste navegador. O salvamento está bloqueado para preservar os dados existentes.');}
 },[storageKey,draftId,active?.id]);
 function current():Draft{if(!active)throw new Error('Escolha um levantamento.');return validateDraft({version:1,id:id||crypto.randomUUID(),surveyId:active.id,title:title.trim(),product,quality,resolution:Number(resolution),gcp,notes,savedAt:new Date().toISOString()});}
 function save(){try{const d=current(),saved=readDrafts(localStorage.getItem(storageKey));if(!id&&saved.length>=100)throw new Error('Limite de 100 rascunhos neste navegador. Exporte uma ficha para guardar uma cópia.');const next=[d,...saved.filter(x=>x.id!==d.id)];localStorage.setItem(storageKey,JSON.stringify(next));setId(d.id);setDrafts(next);setMessage('Rascunho salvo neste navegador. Nenhum processamento foi iniciado.');}catch(e){setMessage(e instanceof Error?e.message:'Não foi possível salvar o rascunho.');}}
 function exportDraft(){try{const d=current();const file=new Blob([JSON.stringify({draft:d,status:'draft',engine:'local_queue',image_inventory_checked_at:new Date().toISOString(),images:images.map(i=>({name:i.name,size_bytes:i.metadata?.size??null})),notice:'Ficha de preparação. As fotos permanecem privadas; a tarefa executável é criada pelo botão Iniciar processamento.'},null,2)],{type:'application/json'});const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=`orion-processamento-${d.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){setMessage(e instanceof Error?e.message:'Não foi possível exportar.');}}
 const activeJob=jobs.find(j=>!['completed','error','cancelled'].includes(j.status));
 const availableSurveyIds=new Set(surveys.filter(s=>!s.deletion_requested_at).map(s=>s.id));
 const visibleDrafts=drafts.filter(d=>availableSurveyIds.has(d.surveyId));

 async function startProcessing(){
  if(!active||queueBusy)return;
  try{
   const d=current();
   if(images.length<3)throw new Error('São necessárias pelo menos 3 imagens para iniciar o processamento.');
   setQueueBusy(true);setMessage('Criando tarefa na fila do Orion Maps…');
   const result=await queueProcessing({surveyId:active.id,inputImageCount:images.length,product:d.product,quality:d.quality,resolution:d.resolution,gcp:d.gcp,notes:d.notes});
   if(!result.ok)throw new Error(result.error||'Não foi possível criar a tarefa.');
   setMessage('Tarefa criada. O processador local iniciará automaticamente quando estiver online.');
   router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível iniciar o processamento.');}
  finally{setQueueBusy(false);}
 }
 return <><section className="mb-5 flex flex-wrap items-end justify-between gap-4">
  <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Produtos do levantamento</p><h2 className="mt-2 text-2xl font-semibold">Fotos e processamento.</h2><p className="mt-1 text-sm text-slate-600">Escolha o pacote, confira as imagens e envie o trabalho para a fila local.</p></div>
  <Link className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700" href="/painel/novo">+ Novo levantamento</Link>
 </section>
 <EnginePanel devices={devices} error={devicesError}/>
 <LiveProcessingRefresh/>
 {activeJob&&<JobStatusCard job={activeJob} featured/>}
 <div className="mb-6 grid gap-3 sm:grid-cols-3">
  <div className={card}><p className="text-xs text-slate-500">Fotos do levantamento</p><p className="mt-1 text-2xl font-semibold">{imageError?'—':active?images.length:'—'}</p></div>
  <div className={card}><p className="text-xs text-slate-500">Fila atual</p><p className="mt-1 text-2xl font-semibold">{activeJob?activeJob.progress+'%':'Livre'}</p></div>
  <div className={card}><p className="text-xs text-slate-500">Rascunhos locais</p><p className="mt-1 text-2xl font-semibold">{visibleDrafts.length}</p></div>
 </div>
 <details className={`${card} mb-6`}><summary className="cursor-pointer font-semibold">Antes de enviar as imagens</summary><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600"><li>Use fotos originais do mesmo levantamento, com sobreposição e nitidez. Preserve os metadados do drone.</li><li>Envie JPG ou PNG: até 50 MB por arquivo e 200 fotos por lote. Fotos de mensageiros, capturas de tela e imagens sem sobreposição não são adequadas para reconstrução.</li><li>A resolução solicitada não garante acurácia. GCP, RTK e qualidade do voo precisam ser verificados antes do processamento.</li><li>As fotos ficam no armazenamento privado da sua conta. Os rascunhos desta aba ficam somente neste navegador; exporte uma cópia.</li></ul></details>
 {message&&<p role="status" className="flight-message">{message}<button onClick={()=>setMessage('')} aria-label="Fechar aviso">×</button></p>}
 <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_350px]"><section className={card}><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">01 · Imagens do levantamento</h2><button type="button" className="text-sm font-semibold text-emerald-800" onClick={()=>router.refresh()}>Atualizar lista</button></div><form action="/processamento"><label className="text-sm font-semibold">Escolher levantamento<select name="levantamento" defaultValue={active?.id||''} className={field} required><option value="" disabled>Selecione uma área</option>{surveys.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className={`${button} my-4`} disabled={!surveys.length}>Abrir levantamento</button><p className="mb-5 text-xs text-slate-500">Salve o rascunho antes de trocar de área.</p></form>{imageError?<p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{imageError}</p>:active?<ImageWorkspace survey={active} images={images}/>:<div className="rounded-xl bg-emerald-50 p-8 text-center"><p className="font-semibold">Escolha a área para começar</p><p className="mt-2 text-sm text-slate-600">As fotos já enviadas pelo painel aparecem aqui, sem precisar enviar novamente.</p><Link href="/painel/novo" className="mt-4 inline-block text-sm font-semibold text-emerald-800">Criar meu primeiro levantamento ↗</Link></div>}</section>
 <form className={card} onSubmit={e=>{e.preventDefault();save();}}><h2 className="text-lg font-semibold">02 · Preparar processamento</h2><label className="mt-5 block text-sm font-semibold">Nome do trabalho<input className={field} value={title} onChange={e=>setTitle(e.target.value)} minLength={2} maxLength={120} required/></label><fieldset className="mt-5"><legend className="mb-3 text-sm font-semibold">Produtos desejados</legend><div className="space-y-2">{products.map(p=><label key={p.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${product===p.id?'border-emerald-600 bg-emerald-50':'border-slate-200'}`}><input type="radio" name="product" value={p.id} checked={product===p.id} onChange={()=>setProduct(p.id)} className="mt-1 accent-emerald-700"/><span><strong className="text-sm">{p.name}</strong><small className="mt-1 block leading-5 text-slate-600">{p.description}</small></span></label>)}</div></fieldset>
 <label className="mt-5 block text-sm font-semibold">Qualidade planejada<select className={field} value={quality} onChange={e=>setQuality(e.target.value)}><option value="medium">Equilibrada</option><option value="high">Alta · exige mais memória e tempo</option></select></label><label className="mt-5 block text-sm font-semibold">Resolução desejada da ortofoto (cm/px)<input className={field} type="number" min="0.5" max="100" step="0.1" value={resolution} onChange={e=>setResolution(e.target.value)} required/></label><p className="mt-2 text-xs leading-5 text-slate-500">A resolução possível depende das fotos e da configuração do motor.</p><label className="mt-5 flex gap-3 text-sm"><input type="checkbox" className="accent-emerald-700" checked={gcp} onChange={e=>setGcp(e.target.checked)}/>Este levantamento exige pontos de controle (GCP)</label>{gcp&&<p role="status" className="mt-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">O processamento com GCP está indisponível até existir importação, marcação nas fotos e validação dos pontos. O rascunho pode ser salvo; o processamento só inicia sem esta exigência.</p>}<label className="mt-5 block text-sm font-semibold">Observações<textarea rows={3} className={field} maxLength={3000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Objetivo e cuidados deste levantamento"/></label><div className="mt-5 flex flex-wrap gap-2"><button className={button} disabled={!active||!storageReady}>Salvar rascunho</button><button type="button" className="rounded-lg border border-emerald-200 px-4 py-3 text-sm font-semibold" disabled={!active||!!imageError} onClick={exportDraft}>Exportar ficha</button></div><button type="button" onClick={startProcessing} disabled={!active||!!imageError||images.length<3||!!activeJob||queueBusy||gcp} className="mt-4 w-full rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-100 disabled:text-slate-500" aria-describedby="engine-message">{queueBusy?'Criando tarefa…':activeJob?'Processamento em andamento':'Iniciar processamento'}</button><p id="engine-message" className="mt-2 text-xs leading-5 text-slate-500">{activeJob?`Tarefa ${activeJob.status} · ${activeJob.progress}% · ${activeJob.message||activeJob.stage}`:'O botão cria uma tarefa privada. O agente local do Orion Maps, quando online no seu PC, coleta a tarefa e processa as fotos automaticamente.'}</p></form></div>
 <section className={`${card} my-6`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Meus processamentos</h2><p className="mt-2 text-sm text-slate-600">Fila, andamento e histórico deste levantamento.</p></div><button type="button" className="text-sm font-semibold text-emerald-800" onClick={()=>router.refresh()}>Atualizar status</button></div>{jobsError&&<p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{jobsError}</p>}{jobs.length?<div className="mt-5 grid gap-3">{jobs.map(j=><JobStatusCard key={j.id} job={j}/>)}</div>:<p className="mt-5 rounded-xl bg-emerald-50 p-6 text-sm">Nenhuma tarefa criada para este levantamento. Configure as opções acima e clique em Iniciar processamento.</p>}{visibleDrafts.length>0&&<details className="mt-5 border-t border-emerald-100 pt-4"><summary className="cursor-pointer text-sm font-semibold">Rascunhos deste navegador · {visibleDrafts.length}</summary><div className="mt-3 overflow-auto"><table className="w-full text-left text-sm"><tbody>{visibleDrafts.map(d=><tr key={d.id} className="border-b border-slate-100"><td className="p-3">{d.title}</td><td className="p-3">{products.find(p=>p.id===d.product)?.name}</td><td className="p-3">{new Date(d.savedAt).toLocaleDateString('pt-BR')}</td><td className="p-3"><Link className="font-semibold text-emerald-800" href={`/processamento?levantamento=${d.surveyId}&rascunho=${d.id}`}>Abrir ↗</Link></td></tr>)}</tbody></table></div></details>}</section><footer className="flight-footer">ORION MAPS · IMAGENS PRIVADAS / PREPARAÇÃO DE FOTOGRAMETRIA</footer></>;
}

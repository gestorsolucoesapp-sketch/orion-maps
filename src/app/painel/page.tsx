import Image from "next/image";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getCurrentAccessToken,getCurrentUser} from "@/lib/supabase/auth";
import {listImages,listSurveys,type Survey,type SurveyImage} from "@/lib/supabase/surveys";
import {listProcessingJobs,type ProcessingJob} from "@/lib/supabase/processing-jobs";
import {listProcessingDevices,type ProcessingDevice} from "@/lib/supabase/processing-devices";
import {listProcessingResults,type ProcessingResult} from "@/lib/supabase/processing-results";
import {signOutAction} from "./actions";
import {ImageWorkspace,SurveyForm,SurveySearch,type SurveyStatus} from "./workspace";
import DeleteSurveyButton from "./delete-survey-button";
import ForceUpdateButton from "@/components/force-update-button";

import LiveProcessingRefresh from "@/components/live-processing-refresh";
import JobStatusCard from "../processamento/job-status-card";
import EnginePanel from "../processamento/engine-panel";

type RecentResult={survey:Survey;result:ProcessingResult};

export default async function PainelPage({searchParams}:{searchParams:Promise<{levantamento?:string;novo?:string;apagado?:string}>}){
  const [user,token,query]=await Promise.all([getCurrentUser(),getCurrentAccessToken(),searchParams]);
  if(!user||!token)redirect("/entrar");
  if(query.novo==="1")redirect("/painel/novo");

  let surveys:Survey[]=[],images:SurveyImage[]=[],error="",imageError="";
  try{surveys=await listSurveys(token);}catch{error="Não foi possível carregar os levantamentos. Atualize a página em instantes.";}

  const active=surveys.find(survey=>survey.id===query.levantamento);
  if(active&&!active.deletion_requested_at){
    try{images=await listImages(active.id,user.id,token);}
    catch{imageError="Não foi possível consultar as fotos. Atualize a página antes de enviar arquivos.";}
  }

  const liveJobs:ProcessingJob[]=[];
  const statusEntries=await Promise.all(surveys.map(async survey=>{
    try{
      const jobs=await listProcessingJobs(survey.id,token);
      const latest=jobs.find(j=>!["completed","error","cancelled"].includes(j.status))||jobs[0];
      if(!survey.deletion_requested_at&&latest&&!["completed","error","cancelled"].includes(latest.status))liveJobs.push(latest);
      let status:SurveyStatus={status:"none",progress:0,resultCount:0};
      if(latest){
        if(latest.status==="completed")status={status:"completed",progress:100,resultCount:1};
        else if(latest.status==="error")status={status:"error",progress:latest.progress,resultCount:0};
        else if(latest.status==="queued")status={status:"queued",progress:latest.progress,resultCount:0};
        else if(latest.status!=="cancelled")status={status:"processing",progress:latest.progress,resultCount:0};
      }
      return [survey.id,status] as const;
    }catch{return [survey.id,{status:"none",progress:0,resultCount:0} satisfies SurveyStatus] as const;}
  }));
  const statuses=Object.fromEntries(statusEntries) as Record<string,SurveyStatus>;

  let devices:ProcessingDevice[]=[],devicesError="";
  try{devices=await listProcessingDevices(token);}
  catch{devicesError="Não foi possível consultar o processador agora.";}

  let recentResults:RecentResult[]=[];
  try{
    const completed=surveys.filter(s=>!s.deletion_requested_at&&statuses[s.id]?.status==="completed");
    const groups=await Promise.all(completed.map(async survey=>{
      const rows=await listProcessingResults(survey.id,token);
      const preferred=rows.filter(r=>["orthophoto","hypsometry","hillshade","slope","contours"].includes(r.kind));
      return (preferred.length?preferred:rows).slice(0,3).map(result=>({survey,result}));
    }));
    recentResults=groups.flat().slice(0,8);
  }catch{}

  const activeStatus=active?statuses[active.id]:undefined;
  const activeProcessing=activeStatus?.status==="queued"||activeStatus?.status==="processing";
  const activeDeleting=Boolean(active?.deletion_requested_at);
  const activeResultsHref=active&&!activeDeleting?`/processamento/resultados?levantamento=${active.id}`:"/processamento";
  const activeProductsHref=active&&!activeDeleting?`/processamento?levantamento=${active.id}`:"/processamento";

  return <main className="min-h-screen bg-[#eaf1e7] text-slate-900" style={{backgroundImage:"radial-gradient(circle at 12% 0%,rgba(97,145,108,.22),transparent 30%),radial-gradient(circle at 100% 18%,rgba(30,83,67,.12),transparent 26%)"}}>
    <div className="mx-auto max-w-[1460px] px-3 pb-24 sm:px-7 lg:px-9">
      <header className="print:hidden">
        <div className="mt-3 overflow-hidden rounded-[30px] border border-white/10 bg-[#071a1c] text-white shadow-[0_18px_44px_rgba(6,32,24,.22)]">
          <div className="relative min-h-[170px] overflow-hidden px-5 py-5 sm:px-8">
            <div className="absolute inset-0 opacity-55" style={{backgroundImage:"radial-gradient(circle at 78% 20%,rgba(42,129,117,.28),transparent 28%),repeating-radial-gradient(ellipse at 88% 85%,transparent 0 18px,rgba(54,148,157,.16) 19px 20px)"}}/>
            <div className="relative flex items-start justify-between gap-4">
              <Link href="/painel" className="min-w-0">
                <Image src="/orion-maps-logo.jpg" width={420} height={180} alt="Orion Maps Drones · Mapeamento de precisão" className="h-[105px] w-[230px] rounded-2xl object-contain object-left sm:h-[122px] sm:w-[290px]"/>
              </Link>
              <div className="flex items-center gap-2 sm:gap-3">
                <ForceUpdateButton/>
                <span className="hidden max-w-56 truncate text-xs text-white/60 sm:inline">{user.email}</span>
                <form action={signOutAction} className="hidden sm:block"><button className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm text-white">Sair</button></form>
              </div>
            </div>
            <p className="relative mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-100/65">Levantar · Processar · Transformar</p>
          </div>
        </div>

        <div className="sticky top-2 z-30 -mt-5 mx-3 rounded-[20px] border border-white/70 bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(32,76,54,.14)] backdrop-blur sm:mx-6">
          <nav className="grid grid-cols-3 gap-1 text-center text-xs font-semibold sm:text-sm">
            <Link href="/painel" className="rounded-2xl bg-emerald-900 px-2 py-3 text-white"><span aria-hidden className="mr-1">▤</span> Levantamentos</Link>
            {activeDeleting?<span aria-disabled="true" className="rounded-2xl px-2 py-3 text-slate-400"><span aria-hidden className="mr-1">◇</span> Produtos</span>:<Link href={activeProductsHref} className="rounded-2xl px-2 py-3 text-slate-600 hover:bg-slate-50"><span aria-hidden className="mr-1">◇</span> Produtos</Link>}
            {activeDeleting?<span aria-disabled="true" className="rounded-2xl px-2 py-3 text-slate-400"><span aria-hidden className="mr-1">▥</span> Resultados</span>:<Link href={activeResultsHref} className="rounded-2xl px-2 py-3 text-slate-600 hover:bg-slate-50"><span aria-hidden className="mr-1">▥</span> Resultados</Link>}
          </nav>
        </div>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-4 py-6 print:hidden">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-800">Orion Maps · Campo</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Levantamentos</h1>
          <p className="mt-1 text-sm text-slate-600">Fotos, processamento e resultados organizados por projeto.</p>
        </div>
        <div className="flex flex-wrap gap-2">{!activeDeleting?<Link href={active?`/agro?levantamento=${active.id}`:"/agro"} className="rounded-2xl border border-emerald-800 bg-white px-5 py-3 text-sm font-semibold text-emerald-900 shadow-sm">Orion Agro · plantio e faixas</Link>:null}<Link href="/painel/novo" className="rounded-2xl bg-emerald-900 px-5 py-3 text-sm font-semibold text-white shadow-sm">+ Novo levantamento</Link></div>
      </section>

      {query.apagado==="1"?<p role="status" className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Levantamento apagado.</p>:null}
      <LiveProcessingRefresh/>
      {error?<p role="alert" className="rounded-2xl bg-red-50 p-5 text-red-800">{error}</p>:<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="min-w-0 print:hidden">
          <EnginePanel devices={devices} error={devicesError}/>
          {liveJobs.map(job=><div key={job.id}>
            <Link href={`/processamento?levantamento=${job.survey_id}`} className="mb-2 block text-sm font-semibold text-emerald-900">{surveys.find(s=>s.id===job.survey_id)?.name||"Levantamento"} →</Link>
            <JobStatusCard job={job} featured/>
          </div>)}

          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-700">Seus projetos</h2>
            <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">{surveys.length}</span>
          </div>
          <SurveySearch surveys={surveys} activeId={active?.id} statuses={statuses}/>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_12px_34px_rgba(35,72,48,.10)]">
          {active?.deletion_requested_at?<div className="p-5 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">Exclusão incompleta</p>
            <h2 className="mt-2 break-words text-2xl font-semibold">{active.name}</h2>
            <p role="status" className="mb-6 mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">A exclusão deste levantamento já foi iniciada. Repita a ação para concluir a remoção dos arquivos vinculados.</p>
            <DeleteSurveyButton survey={active} processing={activeProcessing}/>
          </div>:active?<>
            <div className="border-b border-slate-100 bg-gradient-to-br from-[#f8fbf5] to-[#eef6e9] p-5 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Levantamento pessoal</p>
                    {activeStatus?.status==="completed"&&<span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">● CONCLUÍDO</span>}
                  </div>
                  <h2 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">{active.name}</h2>
                  <p className="mt-3 text-sm text-slate-500">⌖ {active.location||"Local a definir"} · {active.drone||"Drone a definir"} · {active.flight_date?.split("-").reverse().join("/")||"Data a definir"}</p>
                </div>
                <div className="print:hidden"><DeleteSurveyButton survey={active} processing={activeProcessing}/></div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 print:hidden">
                <Link href={`/waypoints?levantamento=${active.id}`} className="rounded-2xl border border-white bg-white/90 p-3 text-center text-xs font-semibold text-slate-700 shadow-sm"><span className="mb-1 block text-lg">⌁</span>Planejar voo</Link>
                <a href="#editar" className="rounded-2xl border border-white bg-white/90 p-3 text-center text-xs font-semibold text-slate-700 shadow-sm"><span className="mb-1 block text-lg">✎</span>Editar informações</a>
                <a href="#imagens" className="rounded-2xl border border-white bg-white/90 p-3 text-center text-xs font-semibold text-slate-700 shadow-sm"><span className="mb-1 block text-lg">▧</span>Adicionar imagens</a>
                <Link href={activeProductsHref} className="rounded-2xl border border-white bg-white/90 p-3 text-center text-xs font-semibold text-slate-700 shadow-sm"><span className="mb-1 block text-lg">▶</span>Processamento</Link>
                <Link href={activeResultsHref} className={`rounded-2xl p-3 text-center text-xs font-semibold shadow-sm ${activeStatus?.status==="completed"?"bg-emerald-900 text-white":"border border-white bg-white/70 text-slate-400"}`}><span className="mb-1 block text-lg">▥</span>Ver resultados</Link>
              </div>
            </div>

            <div className="p-5 sm:p-8">
              {active.notes&&<p className="mb-5 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{active.notes}</p>}
              <details id="editar" className="mb-6 scroll-mt-28 rounded-2xl border border-slate-200 p-4 print:hidden">
                <summary className="cursor-pointer text-sm font-semibold">Editar informações do levantamento</summary>
                <div className="pt-5"><SurveyForm key={active.id} survey={active}/></div>
              </details>

              <div id="imagens" className="scroll-mt-28">
                {imageError?<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{imageError}</p>:<ImageWorkspace key={active.id} survey={active} images={images}/>}
              </div>
            </div>
          </>:<div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-3xl text-emerald-800">⌖</span>
            <h2 className="mt-5 text-2xl font-semibold">{query.levantamento?"Levantamento não encontrado":"Seu trabalho, organizado por área"}</h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-slate-500">Escolha um levantamento ao lado ou crie uma nova área para começar.</p>
            <Link href="/painel/novo" className="mt-6 rounded-xl bg-emerald-900 px-5 py-3 text-sm font-semibold text-white">Criar levantamento</Link>
          </div>}
        </section>
      </div>}

      {recentResults.length>0&&<section className="mt-7 print:hidden">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Acesso rápido</p><h2 className="mt-1 text-2xl font-semibold">Resultados recentes</h2></div>
          {active&&!activeDeleting?<Link href={activeResultsHref} className="text-sm font-semibold text-emerald-900">Ver resultados →</Link>:null}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:none]">
          {recentResults.map(({survey,result})=>{
            const visual=!!result.preview_url&&(result.mime_type==="image/jpeg"||result.mime_type==="image/png");
            return <Link key={result.id} href={`/processamento/resultados?levantamento=${survey.id}`} className="min-w-[210px] max-w-[250px] flex-1 overflow-hidden rounded-[20px] border border-white bg-white shadow-sm">
              <div className="h-28 overflow-hidden bg-gradient-to-br from-emerald-950 to-slate-900">
                {visual?<img src={result.preview_url!} alt="" className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-sm font-bold tracking-widest text-white/85">{result.kind.toUpperCase()}</div>}
              </div>
              <div className="p-3">
                <strong className="block truncate text-sm">{result.display_name||result.kind}</strong>
                <span className="mt-1 block truncate text-xs text-slate-500">{survey.name}</span>
              </div>
            </Link>
          })}
        </div>
      </section>}

      <footer className="py-8 text-center text-xs text-slate-400">Orion Maps · Mapeamento de precisão</footer>
    </div>
  </main>;
}

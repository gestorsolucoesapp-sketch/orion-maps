import Image from "next/image";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getCurrentUser,getCurrentAccessToken} from "@/lib/supabase/auth";
import {listSurveys,listImages,type Survey,type SurveyImage} from "@/lib/supabase/surveys";
import {listProcessingResults,type ProcessingResult} from "@/lib/supabase/processing-results";
import {listProcessingJobs,type ProcessingJob} from "@/lib/supabase/processing-jobs";
import {listProcessingDevices,type ProcessingDevice} from "@/lib/supabase/processing-devices";
import ProcessingWorkspace from "./workspace";
import "../waypoints/waypoints.css";

export default async function ProcessingPage({searchParams}:{searchParams:Promise<{levantamento?:string;rascunho?:string}>}){
  const [user,token,query]=await Promise.all([getCurrentUser(),getCurrentAccessToken(),searchParams]);
  if(!user||!token)redirect("/entrar?retorno=%2Fprocessamento");

  let surveys:Survey[]=[],images:SurveyImage[]=[],results:ProcessingResult[]=[],jobs:ProcessingJob[]=[],devices:ProcessingDevice[]=[],error="",imageError="",jobsError="",devicesError="";
  try{surveys=await listSurveys(token);}catch{error="Não foi possível carregar seus levantamentos. Atualize a página para tentar novamente.";}
  try{devices=await listProcessingDevices(token);}catch{devicesError="Não foi possível verificar o processador local agora.";}

  const active=surveys.find(s=>s.id===query.levantamento);
  if(active){
    try{images=await listImages(active.id,user.id,token);}catch{imageError="Não foi possível consultar as imagens. Atualize a página antes de preparar o pedido.";}
    try{results=await listProcessingResults(active.id,token);}catch{results=[];}
    try{jobs=await listProcessingJobs(active.id,token);}catch{jobsError="Não foi possível carregar o histórico de processamento agora.";}
    const latestCompleted=jobs.find(j=>j.status==="completed");
    if(latestCompleted)results=results.filter(r=>r.job_id===latestCompleted.id);
  }

  const projectHref=active?`/painel?levantamento=${active.id}`:"/painel";
  const productsHref=active?`/processamento?levantamento=${active.id}`:"/processamento";
  const resultsHref=active?`/processamento/resultados?levantamento=${active.id}`:"/processamento";

  return <main className="min-h-screen bg-[#edf3ea] text-slate-900">
    <div className="mx-auto max-w-[1460px] px-4 pb-10 sm:px-7 lg:px-9">
      <header className="print:hidden">
        <div className="mt-4 overflow-hidden rounded-[28px] bg-[#071b20] text-white shadow-[0_14px_36px_rgba(10,45,31,.18)]">
          <div className="flex min-h-[112px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/painel" className="min-w-0">
              <Image src="/orion-maps-brand.svg" width={300} height={75} alt="Orion Maps Drones" className="h-auto w-[220px] sm:w-[300px]"/>
            </Link>
            <Link href={projectHref} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold">← Projeto</Link>
          </div>
        </div>

        <div className="sticky top-2 z-30 -mt-4 mx-3 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur sm:mx-6">
          <nav className="grid grid-cols-3 gap-1 text-center text-sm font-semibold">
            <Link href={projectHref} className="rounded-xl px-3 py-3 text-slate-600">Projeto</Link>
            <Link href={productsHref} className="rounded-xl bg-emerald-800 px-3 py-3 text-white">Produtos</Link>
            <Link href={resultsHref} className="rounded-xl px-3 py-3 text-slate-600">Resultados</Link>
          </nav>
        </div>
      </header>

      <div className="pt-6">
        {active&&<div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Levantamento</p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{active.name}</h1>
            <p className="mt-1 text-xs text-slate-500">{active.location||"Local a definir"} · {active.drone||"Drone a definir"} · {active.flight_date?.split("-").reverse().join("/")||"Data a definir"}</p>
          </div>
          {results.length>0&&<Link href={resultsHref} className="rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white">Ver resultados →</Link>}
        </div>}

        {error?<p role="alert" className="rounded-2xl bg-red-50 p-5 text-red-800">{error}</p>:<ProcessingWorkspace key={active?.id||"none"} userId={user.id} surveys={surveys} active={active} images={images} imageError={imageError} jobs={jobs} jobsError={jobsError} devices={devices} devicesError={devicesError} draftId={query.rascunho}/>}
      </div>
    </div>
  </main>;
}

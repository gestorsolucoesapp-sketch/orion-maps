import Image from "next/image";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getCurrentAccessToken,getCurrentUser} from "@/lib/supabase/auth";
import {listSurveys} from "@/lib/supabase/surveys";
import {listProcessingResults} from "@/lib/supabase/processing-results";
import {listProcessingJobs} from "@/lib/supabase/processing-jobs";
import {listMissionPlanCandidates,findMissionBoundaryForBounds} from "@/lib/supabase/mission-plans";
import ProcessingResults from "../processing-results";
import EditSurveyHeader from "./edit-survey-header";

export default async function ProcessingResultsPage({searchParams}:{searchParams:Promise<{levantamento?:string}>}){
  const [user,token,query]=await Promise.all([getCurrentUser(),getCurrentAccessToken(),searchParams]);
  if(!user||!token)redirect("/entrar?retorno=%2Fprocessamento%2Fresultados");

  const surveys=await listSurveys(token);
  const active=surveys.find(s=>s.id===query.levantamento);
  if(!active)redirect("/painel");

  let results=await listProcessingResults(active.id,token);
  const jobs=await listProcessingJobs(active.id,token);
  const latestCompleted=jobs.find(j=>j.status==="completed");
  if(latestCompleted)results=results.filter(r=>r.job_id===latestCompleted.id);

  const bounds=(()=>{
    for(const item of results){
      const raw=item.metadata?.bounds_wgs84 as {west?:number;south?:number;east?:number;north?:number}|undefined;
      if(raw&&[raw.west,raw.south,raw.east,raw.north].every(v=>typeof v==="number"&&Number.isFinite(v)))return raw as {west:number;south:number;east:number;north:number};
    }
    return null;
  })();
  let planBoundary:null|{name:string;points:[number,number][]}=null;
  try{
    const missions=await listMissionPlanCandidates(token);
    const match=findMissionBoundaryForBounds(missions,bounds);
    if(match)planBoundary={name:match.name,points:match.points};
  }catch{}

  const projectHref=`/painel?levantamento=${active.id}`;
  const productsHref=`/processamento?levantamento=${active.id}`;

  return <main className="min-h-screen bg-[#eaf1e7] text-slate-900" style={{backgroundImage:"radial-gradient(circle at 10% 0%,rgba(94,145,105,.2),transparent 28%),radial-gradient(circle at 100% 20%,rgba(23,77,63,.10),transparent 26%)"}}>
    <div className="mx-auto max-w-[1460px] px-3 pb-24 sm:px-7 lg:px-9">
      <header className="print:hidden">
        <div className="mt-3 overflow-hidden rounded-[30px] border border-white/10 bg-[#071a1c] text-white shadow-[0_18px_44px_rgba(6,32,24,.22)]">
          <div className="relative min-h-[150px] overflow-hidden px-5 py-5 sm:px-8">
            <div className="absolute inset-0 opacity-55" style={{backgroundImage:"radial-gradient(circle at 78% 20%,rgba(42,129,117,.28),transparent 28%),repeating-radial-gradient(ellipse at 88% 85%,transparent 0 18px,rgba(54,148,157,.16) 19px 20px)"}}/>
            <div className="relative flex items-center justify-between gap-4">
              <Link href="/painel" className="min-w-0">
                <Image src="/orion-maps-logo.jpg" width={420} height={180} alt="Orion Maps Drones" className="h-[96px] w-[220px] rounded-2xl object-contain object-left sm:h-[112px] sm:w-[285px]"/>
              </Link>
              <Link href={projectHref} className="rounded-2xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur">← Projeto</Link>
            </div>
          </div>
        </div>

        <div className="sticky top-2 z-30 -mt-5 mx-3 rounded-[20px] border border-white/70 bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(32,76,54,.14)] backdrop-blur sm:mx-6">
          <nav className="grid grid-cols-3 gap-1 text-center text-xs font-semibold sm:text-sm">
            <Link href={projectHref} className="rounded-2xl px-2 py-3 text-slate-600"><span aria-hidden className="mr-1">▤</span> Projeto</Link>
            <Link href={productsHref} className="rounded-2xl px-2 py-3 text-slate-600"><span aria-hidden className="mr-1">◇</span> Produtos</Link>
            <span className="rounded-2xl bg-emerald-900 px-2 py-3 text-white"><span aria-hidden className="mr-1">▥</span> Resultados</span>
          </nav>
        </div>
      </header>

      <section className="pt-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-[24px] border border-white/80 bg-white px-5 py-5 shadow-[0_10px_30px_rgba(22,63,45,.08)]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">Resultado do levantamento</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{active.name}</h1>
            <p className="mt-2 text-sm text-slate-500">{active.location||"Local a definir"} · {active.drone||"Drone a definir"} · {active.flight_date?.split("-").reverse().join("/")||"Data a definir"}</p>
            <EditSurveyHeader survey={active}/><Link href={`/agro?levantamento=${active.id}`} className="mt-3 inline-block rounded-xl border border-emerald-800 bg-white px-4 py-3 text-sm font-semibold text-emerald-900">Planejar plantio / pulverização neste mapa →</Link>
          </div>
          <Link href={`/processamento/relatorio?levantamento=${active.id}`} target="_blank" className="rounded-2xl bg-emerald-900 px-5 py-3 text-sm font-semibold text-white">Exportar PDF ↗</Link>
        </div>

        {results.length?<ProcessingResults results={results} surveyId={active.id} planBoundary={planBoundary}/>:<div className="rounded-[26px] border border-white bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold">Nenhum resultado concluído ainda</h2>
          <p className="mt-2 text-sm text-slate-500">Quando o processamento terminar, ortofoto, elevação, curvas e downloads aparecerão aqui.</p>
          <Link href={productsHref} className="mt-5 inline-block rounded-xl bg-emerald-900 px-5 py-3 text-sm font-semibold text-white">Ir para produtos</Link>
        </div>}
      </section>
    </div>
  </main>;
}

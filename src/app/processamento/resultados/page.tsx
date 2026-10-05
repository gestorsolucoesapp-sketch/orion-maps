import Image from "next/image";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getCurrentAccessToken,getCurrentUser} from "@/lib/supabase/auth";
import {listSurveys} from "@/lib/supabase/surveys";
import {listProcessingResults} from "@/lib/supabase/processing-results";
import {listProcessingJobs} from "@/lib/supabase/processing-jobs";
import ProcessingResults from "../processing-results";

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

  const projectHref=`/painel?levantamento=${active.id}`;
  const productsHref=`/processamento?levantamento=${active.id}`;

  return <main className="min-h-screen bg-[#edf3ea] text-slate-900">
    <div className="mx-auto max-w-[1460px] px-4 pb-10 sm:px-7 lg:px-9">
      <header className="print:hidden">
        <div className="mt-4 overflow-hidden rounded-[28px] bg-[#071b20] text-white shadow-[0_14px_36px_rgba(10,45,31,.18)]">
          <div className="flex min-h-[112px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/painel" className="min-w-0">
              <Image src="/orion-maps-logo.jpg" width={96} height={96} alt="Orion Maps Drones" className="h-[76px] w-[76px] rounded-2xl object-cover shadow-sm sm:h-[88px] sm:w-[88px]"/>
            </Link>
            <Link href={projectHref} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold">← Projeto</Link>
          </div>
        </div>

        <div className="sticky top-2 z-30 -mt-4 mx-3 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur sm:mx-6">
          <nav className="grid grid-cols-3 gap-1 text-center text-sm font-semibold">
            <Link href={projectHref} className="rounded-xl px-3 py-3 text-slate-600">Projeto</Link>
            <Link href={productsHref} className="rounded-xl px-3 py-3 text-slate-600">Produtos</Link>
            <span className="rounded-xl bg-emerald-800 px-3 py-3 text-white">Resultados</span>
          </nav>
        </div>
      </header>

      <section className="pt-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Levantamento</p>
            <h1 className="mt-1 text-2xl font-semibold">{active.name}</h1>
            <p className="mt-1 text-xs text-slate-500">{active.location||"Local a definir"} · {active.drone||"Drone a definir"} · {active.flight_date?.split("-").reverse().join("/")||"Data a definir"}</p>
          </div>
          <Link href={`/processamento/relatorio?levantamento=${active.id}`} target="_blank" className="rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white">Exportar PDF ↗</Link>
        </div>

        {results.length?<ProcessingResults results={results} surveyId={active.id}/>:<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold">Nenhum resultado concluído ainda</h2>
          <p className="mt-2 text-sm text-slate-500">Quando o processamento terminar, ortofoto, elevação, curvas e downloads aparecerão aqui.</p>
          <Link href={productsHref} className="mt-5 inline-block rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white">Ir para produtos</Link>
        </div>}
      </section>
    </div>
  </main>;
}

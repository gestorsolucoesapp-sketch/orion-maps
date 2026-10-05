import {redirect} from "next/navigation";
import {getCurrentAccessToken,getCurrentUser} from "@/lib/supabase/auth";
import {listImages,requireSurvey} from "@/lib/supabase/surveys";
import {listProcessingJobs} from "@/lib/supabase/processing-jobs";
import {listProcessingResults} from "@/lib/supabase/processing-results";
import PrintProjectButton from "./print-button";

function n(v:unknown){
  return typeof v==="number"&&Number.isFinite(v)?v:null;
}
function bytes(value:number|null){
  if(!value)return "—";
  if(value>=1024*1024*1024)return (value/1024/1024/1024).toFixed(2)+" GB";
  if(value>=1024*1024)return (value/1024/1024).toFixed(1)+" MB";
  if(value>=1024)return (value/1024).toFixed(1)+" KB";
  return value+" B";
}

export default async function ProcessingReportPage({searchParams}:{searchParams:Promise<{levantamento?:string}>}){
  const [user,token,query]=await Promise.all([getCurrentUser(),getCurrentAccessToken(),searchParams]);
  if(!user||!token)redirect("/entrar?retorno=%2Fprocessamento%2Frelatorio");
  const surveyId=query.levantamento||"";
  const survey=await requireSurvey(surveyId,token);
  const [images,jobs,results]=await Promise.all([
    listImages(survey.id,user.id,token),
    listProcessingJobs(survey.id,token),
    listProcessingResults(survey.id,token),
  ]);
  const completed=jobs.find(j=>j.status==="completed");
  const currentResults=completed?results.filter(r=>r.job_id===completed.id):results;
  const reference=currentResults[0];
  const meta=reference?.metadata||{};
  const min=n(meta.altitude_min_m),max=n(meta.altitude_max_m),range=n(meta.elevation_range_m);
  const ortho=currentResults.find(r=>r.kind==="orthophoto"&&r.preview_url);

  return <main className="mx-auto max-w-5xl bg-white p-6 text-slate-900 sm:p-10 print:max-w-none print:p-0">
    <div className="print-hide mb-6 flex justify-end"><PrintProjectButton/></div>

    <header className="border-b border-emerald-200 pb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">ORION MAPS</p>
      <h1 className="mt-2 text-3xl font-semibold">Relatório completo do projeto</h1>
      <p className="mt-2 text-sm text-slate-600">Levantamento fotogramétrico e produtos processados</p>
    </header>

    <section className="mt-6 grid gap-4 sm:grid-cols-2">
      <div><span className="text-xs text-slate-500">Projeto</span><strong className="block text-lg">{survey.name}</strong></div>
      <div><span className="text-xs text-slate-500">Local</span><strong className="block text-lg">{survey.location||"—"}</strong></div>
      <div><span className="text-xs text-slate-500">Drone</span><strong className="block text-lg">{survey.drone||"—"}</strong></div>
      <div><span className="text-xs text-slate-500">Data cadastrada</span><strong className="block text-lg">{survey.flight_date?new Date(survey.flight_date+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</strong></div>
      <div><span className="text-xs text-slate-500">Imagens</span><strong className="block text-lg">{images.length}</strong></div>
      <div><span className="text-xs text-slate-500">CRS técnico</span><strong className="block text-lg">{reference?.source_crs||"—"}</strong></div>
    </section>

    <section className="mt-7 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-emerald-50 p-4"><span className="text-xs text-slate-600">Altitude mínima</span><strong className="mt-1 block text-2xl">{min!==null?min.toLocaleString("pt-BR",{maximumFractionDigits:2})+" m":"—"}</strong></div>
      <div className="rounded-xl bg-emerald-50 p-4"><span className="text-xs text-slate-600">Altitude máxima</span><strong className="mt-1 block text-2xl">{max!==null?max.toLocaleString("pt-BR",{maximumFractionDigits:2})+" m":"—"}</strong></div>
      <div className="rounded-xl bg-emerald-50 p-4"><span className="text-xs text-slate-600">Desnível</span><strong className="mt-1 block text-2xl">{range!==null?range.toLocaleString("pt-BR",{maximumFractionDigits:2})+" m":"—"}</strong></div>
    </section>

    {ortho?.preview_url&&<section className="mt-8">
      <h2 className="text-xl font-semibold">Ortofoto do projeto</h2>
      <img src={ortho.preview_url} alt="Ortofoto do levantamento" className="mt-3 w-full rounded-xl border border-slate-200"/>
    </section>}

    <section className="mt-8">
      <h2 className="text-xl font-semibold">Produtos gerados</h2>
      <table className="mt-3 w-full border-collapse text-sm">
        <thead><tr className="border-b border-emerald-200 text-left"><th className="py-2">Produto</th><th className="py-2">Formato</th><th className="py-2">Tamanho</th><th className="py-2">CRS</th></tr></thead>
        <tbody>{currentResults.map(item=><tr key={item.id} className="border-b border-slate-100"><td className="py-2 font-semibold">{item.display_name||item.kind}</td><td className="py-2">{item.mime_type||"—"}</td><td className="py-2">{bytes(item.size_bytes)}</td><td className="py-2">{item.source_crs||"—"}</td></tr>)}</tbody>
      </table>
    </section>

    <section className="mt-8">
      <h2 className="text-xl font-semibold">Histórico do processamento</h2>
      <table className="mt-3 w-full border-collapse text-sm">
        <thead><tr className="border-b border-emerald-200 text-left"><th className="py-2">Criado em</th><th className="py-2">Situação</th><th className="py-2">Progresso</th><th className="py-2">Etapa</th></tr></thead>
        <tbody>{jobs.map(job=><tr key={job.id} className="border-b border-slate-100"><td className="py-2">{new Date(job.created_at).toLocaleString("pt-BR")}</td><td className="py-2">{job.status}</td><td className="py-2">{job.progress}%</td><td className="py-2">{job.stage}</td></tr>)}</tbody>
      </table>
    </section>

    {survey.notes&&<section className="mt-8"><h2 className="text-xl font-semibold">Observações</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{survey.notes}</p></section>}

    <footer className="mt-10 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
      <p>Documento gerado pelo Orion Maps. Produtos derivados por fotogrametria devem ser validados conforme a finalidade técnica.</p>
      <p className="mt-1">Em áreas vegetadas, o DTM representa uma estimativa da superfície do terreno e não substitui validação topográfica quando exigida.</p>
    </footer>
  </main>;
}

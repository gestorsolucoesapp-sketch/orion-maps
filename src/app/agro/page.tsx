import Link from "next/link";
import Image from "next/image";
import {redirect} from "next/navigation";
import {getCurrentUser,getCurrentAccessToken} from "@/lib/supabase/auth";
import {listSurveys} from "@/lib/supabase/surveys";
import {listAgroPlans,loadAgroPlan} from "./actions";
import AgroWorkspace from "./workspace";

export default async function AgroPage({searchParams}:{searchParams:Promise<{levantamento?:string;plano?:string}>}){
 const [user,token,query]=await Promise.all([getCurrentUser(),getCurrentAccessToken(),searchParams]);
 if(!user||!token)redirect("/entrar?retorno=%2Fagro");
 const [allSurveys,saved,loaded]=await Promise.all([listSurveys(token),listAgroPlans(),query.plano?loadAgroPlan(query.plano):Promise.resolve({row:null,error:""})]);
 const requestedId=loaded.row?.survey_id||query.levantamento;
 const requested=allSurveys.find(s=>s.id===requestedId);
 if(requested?.deletion_requested_at)redirect(`/painel?levantamento=${requested.id}`);
 const pendingIds=new Set(allSurveys.filter(s=>s.deletion_requested_at).map(s=>s.id));
 const surveys=allSurveys.filter(s=>!s.deletion_requested_at);
 const availablePlans=saved.rows.filter(p=>!p.survey_id||!pendingIds.has(p.survey_id));
 const surveyId=loaded.row?.survey_id||(surveys.some(s=>s.id===query.levantamento)?query.levantamento:null)||null;
 return <main className="min-h-screen bg-[#eaf1e7] text-slate-900">
  <div className="mx-auto max-w-[1600px] px-3 pb-16 pt-4 sm:px-6">
   <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#071b20] p-4 text-white sm:p-6">
    <Link href="/painel" className="flex items-center gap-3"><Image src="/orion-maps-logo.jpg" alt="Orion Maps" width={60} height={60} className="rounded-xl"/><span><strong className="block text-xl tracking-wide">ORION AGRO</strong><small className="text-emerald-100/80">Do mapa ao planejamento do campo</small></span></Link>
    <nav className="flex flex-wrap gap-2 text-sm"><Link className="rounded-xl border border-white/20 px-4 py-3" href="/painel">Levantamentos</Link><Link className="rounded-xl border border-white/20 px-4 py-3" href="/waypoints">Planejar voo</Link></nav>
   </header>
   <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Talhões, linhas e culturas</h1>
   <p className="mb-5 mt-2 text-sm text-slate-600">Desenhe a área, gere linhas e defina o que plantar. Compare também faixas conceituais de pulverização.</p>
   <AgroWorkspace surveys={surveys} initialSurveyId={surveyId} initialPlan={loaded.row?.plan||null} initialName={loaded.row?.name||"Novo talhão"} initialSaved={availablePlans} initialError={loaded.error||saved.error}/>
  </div>
 </main>;
}

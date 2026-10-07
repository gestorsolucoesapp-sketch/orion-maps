import type {ProcessingJob} from "@/lib/supabase/processing-jobs";
import type {ProcessingResult} from "@/lib/supabase/processing-results";

function n(v:unknown){return typeof v==="number"&&Number.isFinite(v)?v:null;}
function label(value:unknown){return typeof value==="string"&&value.trim()?value.trim():"—";}

export default function ProcessingQuality({job,results,compact=false}:{job:ProcessingJob|null;results:ProcessingResult[];compact?:boolean}){
  if(!job)return null;
  const expected=Array.isArray(job.config?.products)?job.config.products.filter(v=>typeof v==="string") as string[]:[];
  const present=new Set(results.map(r=>r.kind));
  const complete=expected.length?expected.filter(k=>present.has(k as ProcessingResult["kind"])).length:results.length;
  const dtm=results.find(r=>r.kind==="dtm"),meta=dtm?.metadata||{};
  const min=n(meta.altitude_min_m),max=n(meta.altitude_max_m),range=n(meta.elevation_range_m);
  const gcp=job.config?.gcp_requested===true;
  const quality=label(job.config?.quality);
  const precisionKeys=["rmse_horizontal_m","rmse_vertical_m","checkpoint_rmse_m","accuracy_horizontal_m","accuracy_vertical_m"];
  const validated=results.some(r=>precisionKeys.some(k=>n(r.metadata?.[k])!==null));
  const itemClass=compact?"rounded-xl border border-slate-200 p-3":"rounded-2xl border border-slate-200 bg-white p-4";
  return <section className={compact?"mt-6":"mt-5"}>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Controle de qualidade</p><h2 className={compact?"mt-1 text-lg font-semibold":"mt-1 text-xl font-semibold"}>Rastreabilidade do resultado</h2></div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">Job {job.id.slice(0,8)}</span>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className={itemClass}><span className="text-xs text-slate-500">Processamento</span><strong className="mt-1 block">{job.status==="completed"?"Concluído · 100%":job.status+" · "+job.progress+"%"}</strong><small className="text-slate-500">{job.input_image_count} imagens · {job.engine}</small></div>
      <div className={itemClass}><span className="text-xs text-slate-500">Produtos esperados</span><strong className="mt-1 block">{complete}/{expected.length||results.length}</strong><small className="text-slate-500">Preset {label(job.config?.preset)} · qualidade {quality}</small></div>
      <div className={itemClass}><span className="text-xs text-slate-500">Controle terrestre</span><strong className="mt-1 block">{gcp?"GCP solicitado":"GCP não solicitado"}</strong><small className="text-slate-500">RTK/checkpoints: dados insuficientes para verificar</small></div>
      <div className={itemClass}><span className="text-xs text-slate-500">Precisão certificada</span><strong className="mt-1 block">{validated?"Métrica registrada":"Não"}</strong><small className="text-slate-500">{validated?"Consulte as métricas registradas.":"Sem RMSE/checkpoints registrados neste resultado."}</small></div>
    </div>
    {dtm&&<div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
      <strong>Altimetria do DTM deste processamento:</strong> {min!==null&&max!==null?`${min.toLocaleString("pt-BR",{maximumFractionDigits:2})} m a ${max.toLocaleString("pt-BR",{maximumFractionDigits:2})} m`:"extremos não registrados"}{range!==null?` · amplitude ${range.toLocaleString("pt-BR",{maximumFractionDigits:2})} m`:""}.
      <span className="block text-xs text-emerald-900/80">A amplitude é máxima menos mínima do DTM atual; não é altura de voo nem precisão vertical. Em vegetação, o terreno é estimado e requer validação apropriada para uso topográfico/legal.</span>
    </div>}
  </section>;
}

"use client";

import dynamic from "next/dynamic";
import {useState} from "react";
import type {ProcessingResult} from "@/lib/supabase/processing-results";

const ResultsMap=dynamic(()=>import("./results-map"),{ssr:false,loading:()=> <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-8 text-center text-sm text-emerald-900">Carregando mapa dos resultados…</div>});

type Props={results:ProcessingResult[];error?:string;surveyId?:string;planBoundary?:{name:string;points:[number,number][]}|null};

function fmtBytes(value:number|null){
  if(!value)return "—";
  if(value>=1024*1024*1024)return `${(value/1024/1024/1024).toFixed(2)} GB`;
  if(value>=1024*1024)return `${(value/1024/1024).toFixed(1)} MB`;
  if(value>=1024)return `${(value/1024).toFixed(1)} KB`;
  return `${value} B`;
}
function num(meta:Record<string,unknown>|null,key:string){
  const value=meta?.[key];
  return typeof value==="number"&&Number.isFinite(value)?value:null;
}

const order=["orthophoto","contours","hillshade","hypsometry","slope","dtm","dsm","point_cloud","report","mesh","other"];
const labels:Record<string,string>={
  orthophoto:"Ortofoto",contours:"Curvas 0,50 m",hillshade:"Relevo sombreado",hypsometry:"Hipsometria",slope:"Declividade",
  dtm:"DTM",dsm:"DSM",point_cloud:"Nuvem de pontos",report:"Relatório",mesh:"Malha 3D",other:"Outro",
};
const short:Record<string,string>={orthophoto:"ORTO",contours:"CURVAS",hillshade:"RELEVO",hypsometry:"HIPS",slope:"SLOPE",dtm:"DTM",dsm:"DSM",point_cloud:"LAZ",report:"PDF",mesh:"3D",other:"ARQ"};

export default function ProcessingResults({results,error,surveyId,planBoundary}:Props){
  const [downloading,setDownloading]=useState<string|null>(null);
  const [selectedKind,setSelectedKind]=useState<string|null>("orthophoto");
  const reportSurveyId=surveyId||results[0]?.survey_id||"";
  const sorted=[...results].sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
  const reference=sorted[0];
  const min=num(reference?.metadata??null,"altitude_min_m");
  const max=num(reference?.metadata??null,"altitude_max_m");
  const range=num(reference?.metadata??null,"elevation_range_m");

  async function forceDownload(item:ProcessingResult){
    if(!item.download_url||downloading)return;
    setDownloading(item.id);
    try{
      const response=await fetch(item.download_url,{cache:"no-store"});
      if(!response.ok)throw new Error();
      const blob=await response.blob();
      const url=URL.createObjectURL(blob),a=document.createElement("a");
      const ext=item.storage_path.split(".").pop()||"bin";
      const base=(item.display_name||item.kind).replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"")||"orion-map";
      a.href=url;a.download=base+"."+ext;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch{window.open(item.download_url,"_blank","noopener,noreferrer");}
    finally{setDownloading(null);}
  }

  function openResult(item:ProcessingResult){
    const mapKinds=["orthophoto","contours","hillshade","hypsometry","slope"];
    if(mapKinds.includes(item.kind)){
      setSelectedKind(item.kind);
      requestAnimationFrame(()=>document.querySelector('[aria-label="Mapa dos resultados do processamento"]')?.scrollIntoView({behavior:"smooth",block:"center"}));
      return;
    }
    if(item.kind==="point_cloud"){
      setSelectedKind("point_cloud");
      requestAnimationFrame(()=>document.getElementById("nuvem-pontos")?.scrollIntoView({behavior:"smooth",block:"center"}));
      return;
    }
    void forceDownload(item);
  }

  if(error)return <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error}</section>;
  if(!results.length)return null;

  return <section className="mb-8">
    <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(22,63,45,.08)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">Resultados do levantamento</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Processamento concluído</h2>
          <p className="mt-1 text-sm text-slate-500">{results.length} produtos prontos para consulta.</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900">● Concluído · 100%</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-[#f2f7ed] p-4"><span className="text-xs text-slate-500">Altitude mínima</span><strong className="mt-1 block text-2xl text-slate-950">{min!==null?min.toLocaleString("pt-BR",{maximumFractionDigits:2}):"—"} <small className="text-xs font-normal">m</small></strong></div>
        <div className="rounded-2xl bg-[#f2f7ed] p-4"><span className="text-xs text-slate-500">Altitude máxima</span><strong className="mt-1 block text-2xl text-slate-950">{max!==null?max.toLocaleString("pt-BR",{maximumFractionDigits:2}):"—"} <small className="text-xs font-normal">m</small></strong></div>
        <div className="rounded-2xl bg-[#f2f7ed] p-4"><span className="text-xs text-slate-500">Desnível</span><strong className="mt-1 block text-2xl text-slate-950">{range!==null?range.toLocaleString("pt-BR",{maximumFractionDigits:2}):"—"} <small className="text-xs font-normal">m</small></strong></div>
        <div className="col-span-2 rounded-2xl bg-[#101d37] p-4 text-white lg:col-span-1"><span className="text-xs text-slate-300">CRS técnico</span><strong className="mt-1 block text-xl">{reference?.source_crs||"—"}</strong></div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold text-slate-800">Produtos disponíveis</p>
        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
          {sorted.map(item=>{
            const visual=!!item.preview_url&&(item.mime_type==="image/jpeg"||item.mime_type==="image/png");
            return <button key={item.id} type="button" onClick={()=>openResult(item)} disabled={downloading!==null} className="group min-w-[168px] max-w-[190px] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm disabled:opacity-60">
              <div className="relative h-24 overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-800 to-slate-900">
                {visual?<img src={item.preview_url!} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]"/>:<div className="grid h-full place-items-center text-lg font-bold tracking-widest text-white/90">{short[item.kind]||"ARQ"}</div>}
                <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur">{["orthophoto","contours","hillshade","hypsometry","slope"].includes(item.kind)?"Mostrar no mapa":"Baixar"}</span>
              </div>
              <div className="p-3">
                <strong className="block truncate text-sm text-slate-900">{item.display_name||labels[item.kind]||item.kind}</strong>
                <span className="mt-1 block text-[11px] text-slate-500">{fmtBytes(item.size_bytes)}</span>
              </div>
            </button>
          })}
        </div>
      </div>

      <div className="mt-6"><ResultsMap results={results} planBoundary={planBoundary} focusKind={selectedKind==="point_cloud"?null:selectedKind}/></div>

      {selectedKind==="point_cloud"&&(()=>{
        const cloud=sorted.find(item=>item.kind==="point_cloud");
        if(!cloud)return null;
        return <section id="nuvem-pontos" className="mt-5 scroll-mt-24 rounded-2xl border border-slate-200 bg-[#f5f8f4] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Nuvem de pontos</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Produto 3D em formato LAZ</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">Esta é a nuvem de pontos gerada pelo processamento. O arquivo está pronto para uso em softwares GIS/CAD e para o futuro visualizador 3D do Orion Maps.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-3"><span className="text-[11px] text-slate-500">Formato</span><strong className="mt-1 block">LAZ</strong></div>
            <div className="rounded-xl bg-white p-3"><span className="text-[11px] text-slate-500">Tamanho</span><strong className="mt-1 block">{fmtBytes(cloud.size_bytes)}</strong></div>
            <div className="col-span-2 rounded-xl bg-white p-3 sm:col-span-1"><span className="text-[11px] text-slate-500">CRS</span><strong className="mt-1 block">{cloud.source_crs||"—"}</strong></div>
          </div>
          <button type="button" onClick={()=>void forceDownload(cloud)} disabled={downloading!==null} className="mt-4 rounded-xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{downloading===cloud.id?"Preparando…":"Baixar nuvem LAZ ↓"}</button>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">O PDF completo registra a existência da nuvem de pontos e seus dados técnicos. Uma visualização 3D interativa não é incorporada ao PDF.</p>
        </section>;
      })()}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <a href={"/processamento/relatorio?levantamento="+encodeURIComponent(reportSurveyId)} target="_blank" rel="noreferrer" className="rounded-2xl bg-emerald-900 px-5 py-4 text-center text-sm font-semibold text-white">Exportar PDF ↗</a>
        <button type="button" onClick={()=>document.getElementById("arquivos-tecnicos")?.scrollIntoView({behavior:"smooth",block:"start"})} className="rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-sm font-semibold text-emerald-950">Baixar arquivos ↓</button>
        <button type="button" onClick={()=>document.querySelector('[aria-label="Mapa dos resultados do processamento"]')?.scrollIntoView({behavior:"smooth",block:"center"})} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-700">Voltar ao mapa ↑</button>
      </div>

      <details id="arquivos-tecnicos" className="mt-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-slate-50/70">
        <summary className="cursor-pointer px-4 py-4 text-sm font-semibold text-slate-800">Arquivos técnicos e downloads · {sorted.length}</summary>
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead><tr className="text-slate-500"><th className="p-3">Produto</th><th className="p-3">Formato</th><th className="p-3">Tamanho</th><th className="p-3">CRS</th><th className="p-3">Ação</th></tr></thead>
            <tbody>{sorted.map(item=><tr key={item.id} className="border-t border-slate-100 bg-white">
              <td className="p-3 font-semibold text-slate-900">{item.display_name||labels[item.kind]||item.kind}</td>
              <td className="p-3 text-slate-500">{item.mime_type||"—"}</td>
              <td className="p-3 text-slate-500">{fmtBytes(item.size_bytes)}</td>
              <td className="p-3 text-slate-500">{item.source_crs||"—"}</td>
              <td className="p-3">{item.download_url?<button type="button" aria-busy={downloading===item.id} disabled={downloading!==null} onClick={()=>void forceDownload(item)} className="rounded-lg px-2 py-1 font-semibold text-emerald-800 disabled:opacity-60">{downloading===item.id?"Preparando":"Baixar ↓"}</button>:<span className="text-slate-400">Indisponível</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>

      <p className="mt-4 text-[11px] leading-5 text-slate-500">DTM e curvas em áreas vegetadas são estimativas fotogramétricas. Para divisa, cadastro ou uso legal, valide a geometria com levantamento apropriado.</p>
    </div>
  </section>;
}

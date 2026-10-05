"use client";

import dynamic from "next/dynamic";
import type {ProcessingResult} from "@/lib/supabase/processing-results";

const ResultsMap=dynamic(()=>import("./results-map"),{ssr:false,loading:()=> <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">Carregando mapa dos resultados…</div>});

type Props={results:ProcessingResult[];error?:string};

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
  orthophoto:"Ortofoto",
  contours:"Curvas de nível",
  hillshade:"Relevo sombreado",
  hypsometry:"Hipsometria",
  slope:"Declividade",
  dtm:"DTM",
  dsm:"DSM",
  point_cloud:"Nuvem de pontos",
  report:"Relatório",
  mesh:"Malha 3D",
  other:"Outro",
};

export default function ProcessingResults({results,error}:Props){
  const sorted=[...results].sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
  const reference=sorted[0];
  const min=num(reference?.metadata??null,"altitude_min_m");
  const max=num(reference?.metadata??null,"altitude_max_m");
  const range=num(reference?.metadata??null,"elevation_range_m");

  if(error)return <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error}</section>;
  if(!results.length)return null;

  return <section className="mb-6 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Resultados disponíveis</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">Processamento concluído</h2>
        <p className="mt-2 text-sm text-slate-600">{results.length} produtos registrados para este levantamento.</p>
      </div>
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">Concluído · 100%</span>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl bg-emerald-50 p-4"><span className="text-xs text-slate-600">Altitude mínima</span><strong className="mt-1 block text-2xl text-slate-900">{min!==null?min.toLocaleString("pt-BR",{maximumFractionDigits:2}):"—"} <small className="text-xs font-normal">m</small></strong></div>
      <div className="rounded-xl bg-emerald-50 p-4"><span className="text-xs text-slate-600">Altitude máxima</span><strong className="mt-1 block text-2xl text-slate-900">{max!==null?max.toLocaleString("pt-BR",{maximumFractionDigits:2}):"—"} <small className="text-xs font-normal">m</small></strong></div>
      <div className="rounded-xl bg-emerald-50 p-4"><span className="text-xs text-slate-600">Desnível</span><strong className="mt-1 block text-2xl text-slate-900">{range!==null?range.toLocaleString("pt-BR",{maximumFractionDigits:2}):"—"} <small className="text-xs font-normal">m</small></strong></div>
      <div className="rounded-xl bg-slate-900 p-4 text-white"><span className="text-xs text-slate-300">CRS técnico</span><strong className="mt-1 block text-lg">{reference?.source_crs||"—"}</strong></div>
    </div>

    <div className="mt-6">
      <ResultsMap results={results}/>
    </div>

    <div className="mt-6 overflow-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead><tr className="border-b border-emerald-200 text-slate-600"><th className="p-3">Produto</th><th className="p-3">Formato</th><th className="p-3">Tamanho</th><th className="p-3">CRS</th><th className="p-3">Ação</th></tr></thead>
        <tbody>{sorted.map(item=><tr key={item.id} className="border-b border-slate-100">
          <td className="p-3 font-semibold text-slate-900">{item.display_name||labels[item.kind]||item.kind}</td>
          <td className="p-3 text-slate-600">{item.mime_type||"—"}</td>
          <td className="p-3 text-slate-600">{fmtBytes(item.size_bytes)}</td>
          <td className="p-3 text-slate-600">{item.source_crs||"—"}</td>
          <td className="p-3">{item.download_url?<a href={item.download_url} target="_blank" rel="noreferrer" className="font-semibold text-emerald-800">Baixar ↗</a>:<span className="text-slate-400">Indisponível</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <p className="mt-4 text-xs leading-5 text-slate-500">As curvas e o DTM foram derivados por fotogrametria. Em áreas com vegetação, a superfície do terreno é uma estimativa e deve ser validada antes de uso topográfico ou legal.</p>
  </section>;
}

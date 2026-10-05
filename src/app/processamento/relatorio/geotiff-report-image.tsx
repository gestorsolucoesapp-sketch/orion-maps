"use client";

import {useEffect,useState} from "react";
import {renderGeoTiffToDataUrl} from "../geotiff-preview";

export default function GeoTiffReportImage({url,kind}:{url:string;kind:"dtm"|"dsm"}){
  const [src,setSrc]=useState<string|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let cancelled=false;
    renderGeoTiffToDataUrl(url,kind).then(v=>{if(!cancelled)setSrc(v.url)}).catch(()=>{if(!cancelled)setError("Não foi possível renderizar esta perspectiva no navegador.")});
    return()=>{cancelled=true};
  },[url,kind]);
  if(error)return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error}</div>;
  if(!src)return <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Preparando {kind.toUpperCase()}…</div>;
  return <img src={src} alt={kind.toUpperCase()} className="w-full rounded-xl border border-slate-200"/>;
}

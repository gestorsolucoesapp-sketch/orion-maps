"use client";
/* eslint-disable @next/next/no-img-element -- dynamic signed/blob/data map imagery must bypass the Next image optimizer. */

import {useEffect,useState} from "react";
import {renderGeoTiffToDataUrl} from "../geotiff-preview";
import type {ProcessingResult} from "@/lib/supabase/processing-results";
import {freshProcessingUrl} from "@/lib/processing-fresh-url";

export default function GeoTiffReportImage({source,kind}:{source:Pick<ProcessingResult,"id"|"survey_id">;kind:"dtm"|"dsm"|"slope"}){
  const [src,setSrc]=useState<string|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let cancelled=false;
    freshProcessingUrl(source,"download").then(url=>renderGeoTiffToDataUrl(url,kind)).then(v=>{if(!cancelled)setSrc(v.url)}).catch(()=>{if(!cancelled)setError("Não foi possível renderizar esta perspectiva no navegador.")});
    return()=>{cancelled=true};
  },[source,kind]);
  if(error)return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error}</div>;
  if(!src)return <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Preparando {kind.toUpperCase()}…</div>;
  return <img src={src} alt={kind.toUpperCase()} className="w-full rounded-xl border border-slate-200"/>;
}

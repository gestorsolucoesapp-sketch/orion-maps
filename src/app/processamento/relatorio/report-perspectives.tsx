"use client";

import {useEffect,useRef} from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {ProcessingResult} from "@/lib/supabase/processing-results";

type Coord=[number,number];
type Bounds={west:number;south:number;east:number;north:number};
type Props={results:ProcessingResult[];planBoundary?:{name:string;points:Coord[]}|null};

function boundsOf(results:ProcessingResult[]):Bounds|null{
  for(const item of results){
    const raw=item.metadata?.bounds_wgs84 as Partial<Bounds>|undefined;
    if(raw&&[raw.west,raw.south,raw.east,raw.north].every(v=>typeof v==="number"&&Number.isFinite(v)))return raw as Bounds;
  }
  return null;
}

function StaticMap({results,planBoundary,mode}:{results:ProcessingResult[];planBoundary?:Props["planBoundary"];mode:"plan"|"contours"}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const bounds=boundsOf(results);
    const ortho=results.find(r=>r.kind==="orthophoto"&&r.preview_url);
    if(!ref.current||!bounds||!ortho?.preview_url)return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const map=new maplibregl.Map({
      container:ref.current,preserveDrawingBuffer:true,interactive:false,attributionControl:false,renderWorldCopies:false,
      style:{version:8,sources:{
        base:{type:"raster",tiles:["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19},
        ortho:{type:"image",url:ortho.preview_url,coordinates:[[bounds.west,bounds.north],[bounds.east,bounds.north],[bounds.east,bounds.south],[bounds.west,bounds.south]]}
      },layers:[{id:"base",type:"raster",source:"base"},{id:"ortho",type:"raster",source:"ortho",paint:{"raster-opacity":mode==="contours"?0.64:0.9}}]},
      center:[(bounds.west+bounds.east)/2,(bounds.south+bounds.north)/2],zoom:17
    });
    map.on("load",()=>{
      if(mode==="plan"&&planBoundary?.points?.length){
        const poly=[...planBoundary.points,planBoundary.points[0]];
        const data={type:"Feature" as const,properties:{},geometry:{type:"Polygon" as const,coordinates:[poly]}};
        map.addSource("plan",{type:"geojson",data});
        map.addLayer({id:"plan-shadow",type:"line",source:"plan",paint:{"line-color":"#15252a","line-width":5,"line-opacity":0.82}});
        map.addLayer({id:"plan-line",type:"line",source:"plan",paint:{"line-color":"#ffffff","line-width":2.8,"line-dasharray":[2.2,1.7]}});
      }
      if(mode==="contours"){
        const contours=results.find(r=>r.kind==="contours"&&r.preview_url);
        if(contours?.preview_url)fetch(contours.preview_url).then(r=>r.json()).then(data=>{
          if(!map.getSource("contours")){
            map.addSource("contours",{type:"geojson",data});
            map.addLayer({id:"contours",type:"line",source:"contours",paint:{"line-color":"#ff7a1a","line-width":1.8,"line-opacity":0.95}});
          }
        }).catch(()=>{});
      }
      map.fitBounds([[bounds.west,bounds.south],[bounds.east,bounds.north]],{padding:18,maxZoom:19});
    });
    return()=>map.remove();
  },[results,planBoundary,mode]);
  return <div ref={ref} className="mt-3 h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 print:h-[520px]"/>;
}

function Perspective({title,subtitle,children}:{title:string;subtitle?:string;children:React.ReactNode}){
  return <section className="report-perspective mt-8 break-before-page">
    <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Perspectiva técnica</p><h2 className="mt-1 text-xl font-semibold">{title}</h2>{subtitle&&<p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}</div>
    {children}
  </section>;
}

export default function ReportPerspectives({results,planBoundary}:Props){
  const ortho=results.find(r=>r.kind==="orthophoto"&&r.preview_url);
  const hill=results.find(r=>r.kind==="hillshade"&&r.preview_url);
  const hypso=results.find(r=>r.kind==="hypsometry"&&r.preview_url);
  const slope=results.find(r=>r.kind==="slope"&&r.preview_url);
  const cloud=results.find(r=>r.kind==="point_cloud");
  const contours=results.find(r=>r.kind==="contours"&&r.preview_url);
  const cloudSize=cloud?.size_bytes?((cloud.size_bytes/1024/1024).toFixed(1)+" MB"):"—";
  return <>
    {ortho?.preview_url&&<Perspective title="Ortofoto" subtitle="Mosaico ortorretificado do levantamento."><img src={ortho.preview_url} alt="Ortofoto do levantamento" className="w-full rounded-xl border border-slate-200"/></Perspective>}
    {ortho?.preview_url&&<Perspective title="Plano de voo sobre a ortofoto" subtitle={planBoundary?"Contorno salvo do plano de voo utilizado no levantamento.":"Plano compatível não localizado; esta página mostra apenas a ortofoto."}><StaticMap results={results} planBoundary={planBoundary} mode="plan"/></Perspective>}
    {contours?.preview_url&&<Perspective title="Curvas de nível · 0,50 m" subtitle="Linhas de mesma cota altimétrica, com intervalo vertical de 0,50 m."><StaticMap results={results} planBoundary={planBoundary} mode="contours"/></Perspective>}
    {hill?.preview_url&&<Perspective title="Relevo sombreado" subtitle="Representação de relevo por iluminação simulada para facilitar a leitura de formas do terreno."><img src={hill.preview_url} alt="Relevo sombreado" className="w-full rounded-xl border border-slate-200"/></Perspective>}
    {hypso?.preview_url&&<Perspective title="Hipsometria" subtitle="Classes de altitude representadas por cores para comparação visual das cotas do terreno."><img src={hypso.preview_url} alt="Mapa hipsométrico" className="w-full rounded-xl border border-slate-200"/></Perspective>}
    {slope?.preview_url&&<Perspective title="Declividade" subtitle="Representação da inclinação do terreno derivada do modelo digital."><img src={slope.preview_url} alt="Mapa de declividade" className="w-full rounded-xl border border-slate-200"/></Perspective>}
    {cloud&&<Perspective title="Nuvem de pontos" subtitle="Produto tridimensional do levantamento, armazenado em formato LAZ."><div className="rounded-2xl border border-slate-200 bg-slate-50 p-6"><div className="grid gap-4 sm:grid-cols-3"><div><span className="text-xs text-slate-500">Produto</span><strong className="mt-1 block">Nuvem de pontos</strong></div><div><span className="text-xs text-slate-500">Formato</span><strong className="mt-1 block">LAZ</strong></div><div><span className="text-xs text-slate-500">Tamanho</span><strong className="mt-1 block">{cloudSize}</strong></div></div><p className="mt-4 text-xs leading-5 text-slate-600">O arquivo LAZ preserva a nuvem de pontos 3D. O PDF registra o produto e seus dados técnicos; uma visualização 3D interativa exige o visualizador do aplicativo e não é embutida diretamente no documento PDF.</p></div></Perspective>}
  </>;
}

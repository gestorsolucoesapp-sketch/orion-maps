"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import * as maplibregl from "maplibre-gl";
import type {GeoJSONSource,ImageSource} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {ProcessingResult} from "@/lib/supabase/processing-results";

type Bounds={west:number;south:number;east:number;north:number};
type Coord=[number,number];
type Coverage={feature:GeoJSON.Feature<GeoJSON.Polygon>;areaM2:number;perimeterM:number};
type Props={results:ProcessingResult[]};

const rasterKinds=["orthophoto","hillshade","hypsometry","slope"] as const;
type RasterKind=(typeof rasterKinds)[number];

function pxToCoord(x:number,y:number,w:number,h:number,b:Bounds):Coord{
  return [b.west+(x/w)*(b.east-b.west),b.north-(y/h)*(b.north-b.south)];
}
function measure(poly:Coord[]){
  const lat0=poly.reduce((s,p)=>s+p[1],0)/poly.length;
  const mx=111320*Math.cos(lat0*Math.PI/180),my=110574;
  let twice=0,perimeterM=0;
  for(let i=0;i<poly.length-1;i++){
    const [x1,y1]=poly[i],[x2,y2]=poly[i+1];
    twice+=(x1*mx)*(y2*my)-(x2*mx)*(y1*my);
    perimeterM+=Math.hypot((x2-x1)*mx,(y2-y1)*my);
  }
  return {areaM2:Math.abs(twice)/2,perimeterM};
}
async function deriveCoverage(url:string,bounds:Bounds):Promise<Coverage|null>{
  const response=await fetch(url,{cache:"no-store"}); if(!response.ok)return null;
  const bitmap=await createImageBitmap(await response.blob());
  const scale=Math.min(1,420/bitmap.width);
  const w=Math.max(100,Math.round(bitmap.width*scale)),h=Math.max(100,Math.round(bitmap.height*scale));
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
  ctx.drawImage(bitmap,0,0,w,h);
  const d=ctx.getImageData(0,0,w,h).data,left:Coord[]=[],right:Coord[]=[];
  const step=Math.max(2,Math.round(h/140));
  for(let y=0;y<h;y+=step){
    let min=-1,max=-1;
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2],a=d[i+3];
      if(a>20 && (r+g+b)>70){if(min<0)min=x;max=x;}
    }
    if(min>=0&&max-min>3){left.push(pxToCoord(min,y,w,h,bounds));right.push(pxToCoord(max,y,w,h,bounds));}
  }
  if(left.length<4||right.length<4)return null;
  const polygon=[...left,...right.reverse()];polygon.push(polygon[0]);
  return {feature:{type:"Feature",properties:{source:"orthophoto-visible-footprint"},geometry:{type:"Polygon",coordinates:[polygon]}},...measure(polygon)};
}
function readBounds(results:ProcessingResult[]):Bounds|null{
  for(const item of results){
    const raw=item.metadata?.bounds_wgs84 as Partial<Bounds>|undefined;
    if(raw&&[raw.west,raw.south,raw.east,raw.north].every(v=>typeof v==="number"&&Number.isFinite(v))){
      return raw as Bounds;
    }
  }
  return null;
}

export default function ResultsMap({results}:Props){
  const el=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null);
  const [ready,setReady]=useState(false),[coverage,setCoverage]=useState<Coverage|null>(null);
  const [visible,setVisible]=useState<Record<string,boolean>>({orthophoto:true,contours:true,hillshade:false,hypsometry:false,slope:false,project:true});
  const bounds=useMemo(()=>readBounds(results),[results]);
  const orthophoto=results.find(r=>r.kind==="orthophoto"&&r.preview_url);

  useEffect(()=>{
    if(!bounds||!orthophoto?.preview_url)return;
    let cancelled=false;
    deriveCoverage(orthophoto.preview_url,bounds).then(v=>{if(!cancelled)setCoverage(v)}).catch(()=>{});
    return()=>{cancelled=true};
  },[bounds?.west,bounds?.south,bounds?.east,bounds?.north,orthophoto?.preview_url]);

  useEffect(()=>{
    if(!el.current||!bounds)return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const m=new maplibregl.Map({
      container:el.current,
      style:{
        version:8,
        sources:{
          basemap:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,maxzoom:19,attribution:"© OpenStreetMap contributors"},
        },
        layers:[
          {id:"background",type:"background",paint:{"background-color":"#dfe8dc"}},
          {id:"basemap",type:"raster",source:"basemap"},
        ],
      },
      center:[(bounds.west+bounds.east)/2,(bounds.south+bounds.north)/2],
      zoom:17,
      attributionControl:false,
      renderWorldCopies:false,
    });
    map.current=m;
    m.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-left");
    m.addControl(new maplibregl.ScaleControl({unit:"metric"}),"bottom-left");
    m.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");
    m.on("load",()=>{
      const corners:[[number,number],[number,number],[number,number],[number,number]]=[
        [bounds.west,bounds.north],[bounds.east,bounds.north],[bounds.east,bounds.south],[bounds.west,bounds.south],
      ];
      for(const kind of rasterKinds){
        const item=results.find(r=>r.kind===kind&&r.preview_url);
        if(!item?.preview_url)continue;
        m.addSource(`result-${kind}`,{type:"image",url:item.preview_url,coordinates:corners});
        m.addLayer({
          id:`result-${kind}`,
          type:"raster",
          source:`result-${kind}`,
          paint:{"raster-opacity":kind==="orthophoto"?0.92:0.72},
          layout:{visibility:visible[kind]?"visible":"none"},
        });
      }
      const contours=results.find(r=>r.kind==="contours"&&r.preview_url);
      if(contours?.preview_url){
        fetch(contours.preview_url).then(r=>r.json()).then(data=>{
          if(!map.current||!map.current.isStyleLoaded())return;
          map.current.addSource("result-contours",{type:"geojson",data});
          map.current.addLayer({
            id:"result-contours",
            type:"line",
            source:"result-contours",
            paint:{"line-color":"#8a3f17","line-width":1.25,"line-opacity":0.88},
            layout:{visibility:visible.contours?"visible":"none"},
          });
        }).catch(()=>{});
      }
      m.fitBounds([[bounds.west,bounds.south],[bounds.east,bounds.north]],{padding:50,maxZoom:19});
      setReady(true);
    });
    return()=>{m.remove();map.current=null;};
  // visibility is intentionally handled in a separate effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[results,bounds?.west,bounds?.south,bounds?.east,bounds?.north]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready||!coverage)return;
    if(!m.getSource("project-boundary")){
      m.addSource("project-boundary",{type:"geojson",data:coverage.feature});
      m.addLayer({id:"project-boundary-fill",type:"fill",source:"project-boundary",paint:{"fill-color":"#2c5734","fill-opacity":0.04}});
      m.addLayer({id:"project-boundary-line",type:"line",source:"project-boundary",paint:{"line-color":"#1f6f43","line-width":1.5}});
    }else{
      (m.getSource("project-boundary") as GeoJSONSource).setData(coverage.feature);
    }
  },[ready,coverage]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    for(const key of [...rasterKinds,"contours"]){
      const id=`result-${key}`;
      if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible[key]?"visible":"none");
    }
    for(const id of ["project-boundary-fill","project-boundary-line"]){
      if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible.project?"visible":"none");
    }
  },[visible,ready]);

  if(!bounds)return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Os resultados existem, mas ainda não há limites geográficos suficientes para abrir o mapa.</div>;

  const controls=[
    ["orthophoto","Ortofoto"],
    ["project","Área do projeto"],
    ["contours","Curvas 0,50 m"],
    ["hillshade","Relevo sombreado"],
    ["hypsometry","Hipsometria"],
    ["slope","Declividade"],
  ] as const;

  const projectArea=coverage?.areaM2??null;
  const projectPerimeter=coverage?.perimeterM??null;

  return <div>
    {(projectArea!==null||projectPerimeter!==null)&&<div className="mb-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-emerald-50 p-4"><span className="text-xs text-slate-600">Área do projeto</span><strong className="mt-1 block text-xl">{projectArea!==null?(projectArea/10000).toLocaleString("pt-BR",{maximumFractionDigits:2})+" ha":"—"}</strong>{projectArea!==null&&<small className="text-xs text-slate-500">{projectArea.toLocaleString("pt-BR",{maximumFractionDigits:0})} m²</small>}</div>
      <div className="rounded-xl bg-emerald-50 p-4"><span className="text-xs text-slate-600">Perímetro</span><strong className="mt-1 block text-xl">{projectPerimeter!==null?projectPerimeter.toLocaleString("pt-BR",{maximumFractionDigits:0})+" m":"—"}</strong></div>
    </div>}
    <div className="mb-3 flex flex-wrap gap-2">
      {controls.map(([key,label])=><button key={key} type="button" aria-pressed={!!visible[key]} onClick={()=>setVisible(v=>({...v,[key]:!v[key]}))} className={`rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm ${visible[key]?"border-emerald-700 bg-emerald-700 text-white":"border-emerald-200 bg-white text-emerald-900"}`}>{visible[key]?"✓ ":""}{label}</button>)}
    </div>
    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-slate-100">
      <div ref={el} className="h-[560px] w-full min-h-[420px]" aria-label="Mapa dos resultados do processamento"/>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-500">Visualização web em WGS84. A linha fina acompanha a borda útil real da ortofoto e é recalculada no navegador. Os produtos técnicos originais continuam disponíveis para download no CRS registrado em cada arquivo.</p>
  </div>;
}

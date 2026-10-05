"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import * as maplibregl from "maplibre-gl";
import type {GeoJSONSource} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {ProcessingResult} from "@/lib/supabase/processing-results";

type Bounds={west:number;south:number;east:number;north:number};
type Coord=[number,number];
type Coverage={feature:GeoJSON.Feature<GeoJSON.Polygon>;areaM2:number;perimeterM:number};
type Props={
  results:ProcessingResult[];
  planBoundary?:{name:string;points:Coord[]}|null;
  focusKind?:string|null;
};

const rasterKinds=["orthophoto","hillshade","hypsometry","slope"] as const;
const baseMaps={
  streets:{label:"Padrão",url:"https://tile.openstreetmap.org/{z}/{x}/{y}.png",maxzoom:19,attribution:"© OpenStreetMap contributors"},
  satellite:{label:"Satélite",url:"https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",maxzoom:19,attribution:"Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community"},
  relief:{label:"Relevo",url:"https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",maxzoom:13,attribution:"Shaded relief © Esri"}
} as const;
type BaseMap=keyof typeof baseMaps;

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
function coverageFromPlan(plan:{name:string;points:Coord[]}|null|undefined):Coverage|null{
  if(!plan||plan.points.length<3)return null;
  const polygon=[...plan.points];
  polygon.push(plan.points[0]);
  return {
    feature:{type:"Feature",properties:{source:"saved-flight-plan",name:plan.name},geometry:{type:"Polygon",coordinates:[polygon]}},
    ...measure(polygon)
  };
}
async function deriveCoverage(url:string,bounds:Bounds):Promise<Coverage|null>{
  const response=await fetch(url,{cache:"no-store"});if(!response.ok)return null;
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
      if(a>20&&(r+g+b)>70){if(min<0)min=x;max=x;}
    }
    if(min>=0&&max-min>3){left.push(pxToCoord(min,y,w,h,bounds));right.push(pxToCoord(max,y,w,h,bounds));}
  }
  if(left.length<4||right.length<4)return null;
  const polygon=[...left,...right.reverse()];polygon.push(polygon[0]);
  return {feature:{type:"Feature",properties:{source:"orthophoto-visible-footprint",estimated:true},geometry:{type:"Polygon",coordinates:[polygon]}},...measure(polygon)};
}
async function transparentOrthophoto(url:string):Promise<string>{
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)return url;
  const bitmap=await createImageBitmap(await response.blob());
  const maxSide=1800;
  const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return url;
  ctx.drawImage(bitmap,0,0,w,h);
  const image=ctx.getImageData(0,0,w,h),d=image.data;
  for(let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    if(r<28&&g<28&&b<28)d[i+3]=0;
    else if(r<45&&g<45&&b<45)d[i+3]=Math.min(d[i+3],Math.round(((Math.max(r,g,b)-28)/17)*255));
  }
  ctx.putImageData(image,0,0);
  return canvas.toDataURL("image/png");
}

function readBounds(results:ProcessingResult[]):Bounds|null{
  for(const item of results){
    const raw=item.metadata?.bounds_wgs84 as Partial<Bounds>|undefined;
    if(raw&&[raw.west,raw.south,raw.east,raw.north].every(v=>typeof v==="number"&&Number.isFinite(v)))return raw as Bounds;
  }
  return null;
}
function storedCoverage(results:ProcessingResult[]):Coverage|null{
  for(const item of results){
    const meta=item.metadata||{};
    const feature=meta.project_boundary_geojson as GeoJSON.Feature<GeoJSON.Polygon>|undefined;
    const area=typeof meta.project_area_m2==="number"?meta.project_area_m2:Number(meta.project_area_m2);
    const perimeter=typeof meta.project_perimeter_m==="number"?meta.project_perimeter_m:Number(meta.project_perimeter_m);
    if(feature?.geometry?.type==="Polygon"&&Number.isFinite(area)&&Number.isFinite(perimeter))return {feature,areaM2:area,perimeterM:perimeter};
  }
  return null;
}

export default function ResultsMap({results,planBoundary,focusKind}:Props){
  const el=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null);
  const [ready,setReady]=useState(false),[fallbackCoverage,setFallbackCoverage]=useState<Coverage|null>(null);
  const [basemap,setBasemap]=useState<BaseMap>("satellite"),[layersOpen,setLayersOpen]=useState(false),[transparentOrtho,setTransparentOrtho]=useState<string|null>(null);
  const [visible,setVisible]=useState<Record<string,boolean>>({orthophoto:true,contours:false,hillshade:false,hypsometry:false,slope:false,project:true});
  const bounds=useMemo(()=>readBounds(results),[results]);
  const planCoverage=useMemo(()=>coverageFromPlan(planBoundary),[planBoundary]);
  const savedCoverage=useMemo(()=>storedCoverage(results),[results]);
  const coverage=planCoverage||savedCoverage||fallbackCoverage;
  const orthophoto=results.find(r=>r.kind==="orthophoto"&&r.preview_url);

  useEffect(()=>{
    if(!orthophoto?.preview_url){setTransparentOrtho(null);return;}
    let cancelled=false;
    transparentOrthophoto(orthophoto.preview_url).then(url=>{if(!cancelled)setTransparentOrtho(url)}).catch(()=>{if(!cancelled)setTransparentOrtho(orthophoto.preview_url!)});
    return()=>{cancelled=true};
  },[orthophoto?.preview_url]);

  useEffect(()=>{
    if(planCoverage||savedCoverage||!bounds||!orthophoto?.preview_url)return;
    let cancelled=false;
    deriveCoverage(orthophoto.preview_url,bounds).then(v=>{if(!cancelled)setFallbackCoverage(v)}).catch(()=>{});
    return()=>{cancelled=true};
  },[planCoverage,savedCoverage,bounds?.west,bounds?.south,bounds?.east,bounds?.north,orthophoto?.preview_url]);

  useEffect(()=>{
    if(!focusKind)return;
    const next={orthophoto:false,contours:false,hillshade:false,hypsometry:false,slope:false,project:true};
    if(focusKind==="contours"){next.orthophoto=true;next.contours=true;}
    else if(focusKind==="orthophoto")next.orthophoto=true;
    else if(focusKind in next)next[focusKind as keyof typeof next]=true;
    setVisible(v=>({...v,...next}));
    requestAnimationFrame(()=>el.current?.scrollIntoView({behavior:"smooth",block:"center"}));
  },[focusKind]);

  useEffect(()=>{
    if(!el.current||!bounds)return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const bm=baseMaps[basemap];
    const m=new maplibregl.Map({
      container:el.current,
      style:{
        version:8,
        sources:{basemap:{type:"raster",tiles:[bm.url],tileSize:256,maxzoom:bm.maxzoom,attribution:bm.attribution}},
        layers:[{id:"background",type:"background",paint:{"background-color":"#dfe8dc"}},{id:"basemap",type:"raster",source:"basemap"}],
      },
      center:[(bounds.west+bounds.east)/2,(bounds.south+bounds.north)/2],
      zoom:17,attributionControl:false,renderWorldCopies:false,
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
        const item=results.find(r=>r.kind===kind&&r.preview_url);if(!item?.preview_url)continue;
        const sourceUrl=kind==="orthophoto"?(transparentOrtho||item.preview_url):item.preview_url;
        m.addSource(`result-${kind}`,{type:"image",url:sourceUrl,coordinates:corners});
        m.addLayer({id:`result-${kind}`,type:"raster",source:`result-${kind}`,paint:{"raster-opacity":kind==="orthophoto"?0.9:0.78},layout:{visibility:visible[kind]?"visible":"none"}});
      }
      const contours=results.find(r=>r.kind==="contours"&&r.preview_url);
      if(contours?.preview_url)fetch(contours.preview_url).then(r=>r.json()).then(data=>{
        if(!map.current||!map.current.isStyleLoaded())return;
        map.current.addSource("result-contours",{type:"geojson",data});
        map.current.addLayer({id:"result-contours",type:"line",source:"result-contours",paint:{"line-color":"#f28a3b","line-width":1.15,"line-opacity":0.88},layout:{visibility:visible.contours?"visible":"none"}});
      }).catch(()=>{});
      m.fitBounds([[bounds.west,bounds.south],[bounds.east,bounds.north]],{padding:34,maxZoom:19});
      setReady(true);
    });
    return()=>{m.remove();map.current=null;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[results,bounds?.west,bounds?.south,bounds?.east,bounds?.north,basemap,transparentOrtho]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready||!coverage)return;
    if(!m.getSource("project-boundary")){
      m.addSource("project-boundary",{type:"geojson",data:coverage.feature});
      m.addLayer({id:"project-boundary-shadow",type:"line",source:"project-boundary",paint:{"line-color":"#15252a","line-width":4.5,"line-opacity":0.82}});
      m.addLayer({id:"project-boundary-line",type:"line",source:"project-boundary",paint:{"line-color":"#ffffff","line-width":2.6,"line-dasharray":[2.2,1.7],"line-opacity":1}});
    }else (m.getSource("project-boundary") as GeoJSONSource).setData(coverage.feature);
  },[ready,coverage]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    for(const key of [...rasterKinds,"contours"]){const id=`result-${key}`;if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible[key]?"visible":"none");}
    for(const id of ["project-boundary-shadow","project-boundary-line"])if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible.project?"visible":"none");
  },[visible,ready]);

  if(!bounds)return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Os resultados existem, mas ainda não há limites geográficos suficientes para abrir o mapa.</div>;

  const controls=[["orthophoto","Ortofoto"],["project","Plano de voo"],["contours","Curvas 0,50 m"],["hillshade","Relevo sombreado"],["hypsometry","Hipsometria"],["slope","Declividade"]] as const;
  const projectArea=coverage?.areaM2??null,projectPerimeter=coverage?.perimeterM??null;

  return <div>
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {controls.map(([key,label])=><button key={key} type="button" aria-pressed={!!visible[key]} onClick={()=>setVisible(v=>({...v,[key]:!v[key]}))} className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold ${visible[key]?"border-emerald-800 bg-emerald-900 text-white shadow-sm":"border-emerald-200 bg-white text-emerald-950"}`}>{label}</button>)}
    </div>

    <div className="relative overflow-hidden rounded-[22px] border border-emerald-200 bg-slate-100 shadow-[0_10px_30px_rgba(22,63,45,.10)]">
      <div ref={el} className="h-[58vh] min-h-[440px] max-h-[720px] w-full" aria-label="Mapa dos resultados do processamento"/>
      <div className="absolute right-3 top-3 z-10">
        <button type="button" aria-expanded={layersOpen} onClick={()=>setLayersOpen(v=>!v)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/80 bg-white/95 text-xl shadow-md backdrop-blur" title="Camadas">▱</button>
        {layersOpen&&<div className="mt-2 w-56 rounded-2xl border border-slate-200 bg-white/95 p-3 text-sm shadow-xl backdrop-blur">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Mapa base</p>
          <div className="grid gap-1">
            {(Object.keys(baseMaps) as BaseMap[]).map(key=><button key={key} type="button" onClick={()=>setBasemap(key)} className={`rounded-xl px-3 py-2 text-left text-xs font-semibold ${basemap===key?"bg-emerald-900 text-white":"bg-slate-50 text-slate-700"}`}>{baseMaps[key].label}</button>)}
          </div>
          <p className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Sobreposições</p>
          <label className="flex items-center justify-between gap-3 py-1.5"><span>Ortofoto</span><input type="checkbox" checked={!!visible.orthophoto} onChange={()=>setVisible(v=>({...v,orthophoto:!v.orthophoto}))}/></label>
          <label className="flex items-center justify-between gap-3 py-1.5"><span>Plano de voo</span><input type="checkbox" checked={!!visible.project} onChange={()=>setVisible(v=>({...v,project:!v.project}))}/></label>
          <label className="flex items-center justify-between gap-3 py-1.5"><span>Curvas</span><input type="checkbox" checked={!!visible.contours} onChange={()=>setVisible(v=>({...v,contours:!v.contours}))}/></label>
        </div>}
      </div>
    </div>

    {(projectArea!==null||projectPerimeter!==null)&&<div className="mt-4 grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-emerald-100 bg-[#f4f8ef] p-4"><span className="text-xs font-medium text-slate-500">Área do plano</span><strong className="mt-1 block text-xl text-slate-950">{projectArea!==null?(projectArea/10000).toLocaleString("pt-BR",{maximumFractionDigits:2})+" ha":"—"}</strong>{projectArea!==null&&<small className="text-[11px] text-slate-500">{projectArea.toLocaleString("pt-BR",{maximumFractionDigits:0})} m²</small>}</div>
      <div className="rounded-2xl border border-emerald-100 bg-[#f4f8ef] p-4"><span className="text-xs font-medium text-slate-500">Perímetro</span><strong className="mt-1 block text-xl text-slate-950">{projectPerimeter!==null?projectPerimeter.toLocaleString("pt-BR",{maximumFractionDigits:0})+" m":"—"}</strong></div>
    </div>}

    <p className="mt-3 text-[11px] leading-5 text-slate-500">{planCoverage?"A linha branca tracejada usa o contorno salvo do plano de voo.":"Nenhum plano de voo compatível foi encontrado; a linha usa uma estimativa da cobertura processada."}</p>
  </div>;
}

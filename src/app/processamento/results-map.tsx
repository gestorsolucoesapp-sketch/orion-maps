"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import * as maplibregl from "maplibre-gl";
import type {GeoJSONSource} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {ProcessingResult} from "@/lib/supabase/processing-results";
import {renderGeoTiffToDataUrl} from "./geotiff-preview";
import {prepareOrthophotoPreview} from "./orthophoto-preview";

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
  const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx){bitmap.close();return null;}
  ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
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
async function transparentBorderNoData(url:string):Promise<string>{
  const response=await fetch(url,{cache:"no-store"});if(!response.ok)return url;
  const bitmap=await createImageBitmap(await response.blob());
  const maxSide=1800,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx){bitmap.close();return url;}
  ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const image=ctx.getImageData(0,0,w,h),d=image.data,seen=new Uint8Array(w*h),queue:number[]=[];
  const candidate=(p:number)=>{
    const i=p*4,r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    return d[i+3]>0&&mx<105&&(mx-mn)<32;
  };
  const push=(p:number)=>{if(p>=0&&p<w*h&&!seen[p]&&candidate(p)){seen[p]=1;queue.push(p);}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}
  for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
  for(let q=0;q<queue.length;q++){
    const p=queue[q],x=p%w,y=Math.floor(p/w);
    if(x>0)push(p-1);if(x<w-1)push(p+1);if(y>0)push(p-w);if(y<h-1)push(p+w);
  }
  // This legacy mask is used only for the slope visualization, never the ortho.
  const border=new Uint8Array(seen);
  for(let p=0;p<seen.length;p++){
    if(!seen[p])continue;
    const x=p%w,y=Math.floor(p/w);
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<w&&ny>=0&&ny<h)border[ny*w+nx]=1;
    }
  }
  for(let p=0;p<border.length;p++)if(border[p])d[p*4+3]=0;
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
  const [basemap,setBasemap]=useState<BaseMap>("streets"),[layersOpen,setLayersOpen]=useState(false),[transparentOrtho,setTransparentOrtho]=useState<string|null>(null);
  const [orthoBusy,setOrthoBusy]=useState(false),[orthoError,setOrthoError]=useState("");
  const [dtmPreview,setDtmPreview]=useState<string|null>(null),[dsmPreview,setDsmPreview]=useState<string|null>(null),[processedSlope,setProcessedSlope]=useState<string|null>(null),[elevationBusy,setElevationBusy]=useState<string|null>(null),[elevationError,setElevationError]=useState("");
  const [dtmRange,setDtmRange]=useState<{min:number;max:number}|null>(null),[dsmRange,setDsmRange]=useState<{min:number;max:number}|null>(null);
  const [visible,setVisible]=useState<Record<string,boolean>>({orthophoto:true,contours:false,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false,project:false});
  const visibleRef=useRef(visible);
  useEffect(()=>{visibleRef.current=visible;},[visible]);
  const bounds=useMemo(()=>readBounds(results),[results]);
  const planCoverage=useMemo(()=>coverageFromPlan(planBoundary),[planBoundary]);
  const savedCoverage=useMemo(()=>storedCoverage(results),[results]);
  const coverage=planCoverage||savedCoverage||fallbackCoverage;
  const orthophoto=results.find(r=>r.kind==="orthophoto"&&r.preview_url);
  const originalOrthoUrl=orthophoto?.original_preview_url||orthophoto?.preview_url||null;
  const dtm=results.find(r=>r.kind==="dtm"&&r.download_url);
  const dsm=results.find(r=>r.kind==="dsm"&&r.download_url);
  const slope=results.find(r=>r.kind==="slope"&&r.preview_url);

  useEffect(()=>{
    setTransparentOrtho(null);setOrthoError("");
    if(!originalOrthoUrl){setOrthoBusy(false);return;}
    const controller=new AbortController();
    setOrthoBusy(true);
    prepareOrthophotoPreview(originalOrthoUrl,controller.signal).then(url=>{
      if(!controller.signal.aborted)setTransparentOrtho(url);
    }).catch(()=>{
      if(!controller.signal.aborted){
        setTransparentOrtho(originalOrthoUrl);
        setOrthoError("A prévia original foi carregada, mas não foi possível preparar a transparência das bordas.");
      }
    }).finally(()=>{if(!controller.signal.aborted)setOrthoBusy(false);});
    return()=>controller.abort();
  },[originalOrthoUrl]);

  useEffect(()=>{
    if(!slope?.preview_url){setProcessedSlope(null);return;}
    let cancelled=false;
    transparentBorderNoData(slope.preview_url).then(url=>{if(!cancelled)setProcessedSlope(url)}).catch(()=>{if(!cancelled)setProcessedSlope(slope.preview_url!)});
    return()=>{cancelled=true};
  },[slope?.preview_url]);

  useEffect(()=>{
    if(planCoverage||savedCoverage||!bounds||!transparentOrtho)return;
    let cancelled=false;
    deriveCoverage(transparentOrtho,bounds).then(v=>{if(!cancelled)setFallbackCoverage(v)}).catch(()=>{});
    return()=>{cancelled=true};
  },[planCoverage,savedCoverage,bounds?.west,bounds?.south,bounds?.east,bounds?.north,transparentOrtho]);

  useEffect(()=>{
    if(!focusKind)return;
    const next={orthophoto:false,contours:false,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false};
    if(focusKind==="contours"){next.orthophoto=true;next.contours=true;}
    else if(focusKind==="orthophoto")next.orthophoto=true;
    else if(focusKind==="dtm"){
      next.dtm=true;
      if(!dtmPreview&&dtm?.download_url){
        setElevationBusy("dtm");setElevationError("");
        renderGeoTiffToDataUrl(dtm.download_url,"dtm").then(v=>{setDtmPreview(v.url);setDtmRange({min:v.min,max:v.max});}).catch(()=>setElevationError("Não foi possível abrir o DTM no navegador.")).finally(()=>setElevationBusy(null));
      }
    }else if(focusKind==="dsm"){
      next.dsm=true;
      if(!dsmPreview&&dsm?.download_url){
        setElevationBusy("dsm");setElevationError("");
        renderGeoTiffToDataUrl(dsm.download_url,"dsm").then(v=>{setDsmPreview(v.url);setDsmRange({min:v.min,max:v.max});}).catch(()=>setElevationError("Não foi possível abrir o DSM no navegador.")).finally(()=>setElevationBusy(null));
      }
    }else if(focusKind in next)next[focusKind as keyof typeof next]=true;
    // Switching products must not silently enable the flight-plan outline.
    setVisible(v=>({...v,...next}));
    requestAnimationFrame(()=>el.current?.scrollIntoView({behavior:"smooth",block:"center"}));
  },[focusKind,dtmPreview,dsmPreview,dtm?.download_url,dsm?.download_url]);

  useEffect(()=>{
    if(!el.current||!bounds||(originalOrthoUrl&&!transparentOrtho))return;
    setReady(false);
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
    const resizeObserver=new ResizeObserver(()=>m.resize());
    resizeObserver.observe(el.current);
    m.on("load",()=>{
      if(map.current!==m)return;
      const current=visibleRef.current;
      const corners:[[number,number],[number,number],[number,number],[number,number]]=[
        [bounds.west,bounds.north],[bounds.east,bounds.north],[bounds.east,bounds.south],[bounds.west,bounds.south],
      ];
      for(const kind of rasterKinds){
        const item=results.find(r=>r.kind===kind&&r.preview_url);if(!item?.preview_url)continue;
        const sourceUrl=kind==="orthophoto"?(transparentOrtho||originalOrthoUrl||item.preview_url):kind==="slope"?(processedSlope||item.preview_url):item.preview_url;
        m.addSource(`result-${kind}`,{type:"image",url:sourceUrl,coordinates:corners});
        m.addLayer({id:`result-${kind}`,type:"raster",source:`result-${kind}`,paint:{"raster-opacity":kind==="orthophoto"?(current.contours?0.58:1):0.78,"raster-resampling":"linear","raster-fade-duration":0},layout:{visibility:current[kind]?"visible":"none"}});
      }
      if(dtmPreview){
        m.addSource("result-dtm",{type:"image",url:dtmPreview,coordinates:corners});
        m.addLayer({id:"result-dtm",type:"raster",source:"result-dtm",paint:{"raster-opacity":0.88},layout:{visibility:current.dtm?"visible":"none"}});
      }
      if(dsmPreview){
        m.addSource("result-dsm",{type:"image",url:dsmPreview,coordinates:corners});
        m.addLayer({id:"result-dsm",type:"raster",source:"result-dsm",paint:{"raster-opacity":0.88},layout:{visibility:current.dsm?"visible":"none"}});
      }
      const contours=results.find(r=>r.kind==="contours"&&r.preview_url);
      if(contours?.preview_url)fetch(contours.preview_url).then(r=>r.json()).then(data=>{
        if(map.current!==m||!m.isStyleLoaded())return;
        m.addSource("result-contours",{type:"geojson",data});
        m.addLayer({id:"result-contours",type:"line",source:"result-contours",paint:{"line-color":"#ff7a00","line-width":2.4,"line-opacity":1},layout:{visibility:visibleRef.current.contours?"visible":"none"}});
      }).catch(()=>{});
      m.fitBounds([[bounds.west,bounds.south],[bounds.east,bounds.north]],{padding:34,maxZoom:19});
      setReady(true);
    });
    return()=>{resizeObserver.disconnect();setReady(false);m.remove();if(map.current===m)map.current=null;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[results,bounds?.west,bounds?.south,bounds?.east,bounds?.north,basemap,transparentOrtho,originalOrthoUrl,processedSlope,dtmPreview,dsmPreview]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready||!coverage)return;
    if(!m.getSource("project-boundary")){
      m.addSource("project-boundary",{type:"geojson",data:coverage.feature});
      m.addLayer({id:"project-boundary-shadow",type:"line",source:"project-boundary",paint:{"line-color":"#15252a","line-width":4.5,"line-opacity":0.82},layout:{visibility:visible.project?"visible":"none"}});
      m.addLayer({id:"project-boundary-line",type:"line",source:"project-boundary",paint:{"line-color":"#ffffff","line-width":2.6,"line-dasharray":[2.2,1.7],"line-opacity":1},layout:{visibility:visible.project?"visible":"none"}});
    }else (m.getSource("project-boundary") as GeoJSONSource).setData(coverage.feature);
  },[ready,coverage,visible.project]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    for(const key of [...rasterKinds,"contours","dtm","dsm"]){const id=`result-${key}`;if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible[key]?"visible":"none");}
    for(const id of ["project-boundary-shadow","project-boundary-line"])if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible.project?"visible":"none");
    if(m.getLayer("result-orthophoto"))m.setPaintProperty("result-orthophoto","raster-opacity",visible.contours?0.58:1);
  },[visible,ready]);

  if(!bounds)return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Os resultados existem, mas ainda não há limites geográficos suficientes para abrir o mapa.</div>;

  const controls=[["orthophoto","Ortofoto"],["project","Plano de voo"],["contours","Curvas 0,50 m"],["hillshade","Relevo sombreado"],["hypsometry","Hipsometria"],["slope","Declividade"],["dtm","DTM"],["dsm","DSM"]] as const;
  const projectArea=coverage?.areaM2??null,projectPerimeter=coverage?.perimeterM??null;

  return <div>
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {controls.map(([key,label])=><button key={key} type="button" aria-pressed={!!visible[key]} onClick={()=>{if(key==="dtm"||key==="dsm"){if((key==="dtm"&&!dtmPreview)||(key==="dsm"&&!dsmPreview)){const item=key==="dtm"?dtm:dsm;if(item?.download_url){setElevationBusy(key);setElevationError("");renderGeoTiffToDataUrl(item.download_url,key).then(v=>{if(key==="dtm"){setDtmPreview(v.url);setDtmRange({min:v.min,max:v.max});}else{setDsmPreview(v.url);setDsmRange({min:v.min,max:v.max});}setVisible(s=>({...s,[key]:true,orthophoto:false,dtm:key==="dtm",dsm:key==="dsm"}));}).catch(()=>setElevationError("Não foi possível abrir "+key.toUpperCase()+" no navegador.")).finally(()=>setElevationBusy(null));}return;}}setVisible(v=>({...v,[key]:!v[key]}));}} className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold ${visible[key]?"border-emerald-800 bg-emerald-900 text-white shadow-sm":"border-emerald-200 bg-white text-emerald-950"}`}>{elevationBusy===key?"Abrindo…":label}</button>)}
    </div>

    <div className="relative overflow-hidden rounded-[22px] border border-emerald-200 bg-slate-100 shadow-[0_10px_30px_rgba(22,63,45,.10)]">
      <div ref={el} className="h-[58vh] min-h-[440px] max-h-[720px] w-full" aria-label="Mapa dos resultados do processamento" data-ortho-preview="original-v8"/>
      {orthoBusy&&<div role="status" className="absolute inset-0 grid place-items-center bg-[#f4f8ef]/95 text-sm font-medium text-emerald-950">Preparando ortofoto original…</div>}
      <div className="absolute right-3 top-3 z-10">
        <button type="button" aria-expanded={layersOpen} onClick={()=>setLayersOpen(v=>!v)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/80 bg-white/95 text-xl shadow-md backdrop-blur" title="Camadas">▱</button>
        {layersOpen&&<div className="mt-2 w-56 rounded-2xl border border-slate-200 bg-white/95 p-3 text-sm shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <strong className="text-xs text-slate-700">Camadas</strong>
            <button type="button" onClick={()=>setLayersOpen(false)} className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600" aria-label="Fechar camadas">×</button>
          </div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Mapa base</p>
          <div className="grid gap-1">
            {(Object.keys(baseMaps) as BaseMap[]).map(key=><button key={key} type="button" onClick={()=>{setBasemap(key);setLayersOpen(false);}} className={`rounded-xl px-3 py-2 text-left text-xs font-semibold ${basemap===key?"bg-emerald-900 text-white":"bg-slate-50 text-slate-700"}`}>{baseMaps[key].label}</button>)}
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

    {orthoError&&<div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{orthoError}</div>}
    {elevationError&&<div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{elevationError}</div>}
    {visible.contours&&<div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900"><strong>Curvas de nível 0,50 m ativas.</strong> Cada linha representa a mesma cota de terreno; a ortofoto fica mais transparente para destacar as curvas.</div>}
    {visible.dtm&&<div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-900">
      <strong>DTM ativo.</strong> Mostra o modelo estimado do terreno, removendo ao máximo árvores e construções.
      {dtmRange&&<div className="mt-2"><div className="h-2 rounded-full" style={{background:"linear-gradient(90deg,#225e39,#68a04c,#c2c256,#dc9548,#845037)"}}/><div className="mt-1 flex justify-between text-[10px]"><span>{dtmRange.min.toLocaleString("pt-BR",{maximumFractionDigits:1})} m</span><span>{dtmRange.max.toLocaleString("pt-BR",{maximumFractionDigits:1})} m</span></div></div>}
    </div>}
    {visible.dsm&&<div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-xs text-indigo-900">
      <strong>DSM ativo.</strong> Mostra a superfície observada, incluindo vegetação, telhados e outros objetos.
      {dsmRange&&<div className="mt-2"><div className="h-2 rounded-full" style={{background:"linear-gradient(90deg,#2c5fa0,#3a97b0,#5ba878,#d7be52,#b65240)"}}/><div className="mt-1 flex justify-between text-[10px]"><span>{dsmRange.min.toLocaleString("pt-BR",{maximumFractionDigits:1})} m</span><span>{dsmRange.max.toLocaleString("pt-BR",{maximumFractionDigits:1})} m</span></div></div>}
    </div>}
    <p className="mt-3 text-[11px] leading-5 text-slate-500">{visible.project?(planCoverage?"A linha branca tracejada usa o contorno salvo do plano de voo.":"Nenhum plano de voo compatível foi encontrado; a linha usa uma estimativa da cobertura processada."):"Visualização sem contorno. Ative Plano de voo para consultar o limite salvo; as medidas e os arquivos técnicos permanecem inalterados."}</p>
  </div>;
}

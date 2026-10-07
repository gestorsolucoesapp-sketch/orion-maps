"use client";
import MapMeasurement from "@/components/measurement/map-measurement";


import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import SlopeInspector from "./slope-inspector";
import type {MeasureDrawing} from "@/lib/map-measurement";
import * as maplibregl from "maplibre-gl";
import type {GeoJSONSource} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {ProcessingResult} from "@/lib/supabase/processing-results";
import {renderGeoTiffToDataUrl, type RasterCorners} from "./geotiff-preview";
import {SLOPE_CLASSES} from "@/lib/terrain-preview";
import {prepareOrthophotoPreview,type OrthoLoadProgress} from "./orthophoto-preview";
import {orthophotoPreviewUrl} from "@/lib/orthophoto-preview-url";

type Bounds={west:number;south:number;east:number;north:number};
type Coord=[number,number];
type Coverage={feature:GeoJSON.Feature<GeoJSON.Polygon>;areaM2:number;perimeterM:number};
type Props={
  results:ProcessingResult[];
  planBoundary?:{name:string;points:Coord[]}|null;
  focusKind?:string|null;
  focusRevision?:number;
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

export default function ResultsMap({results,planBoundary,focusKind,focusRevision}:Props){
  const el=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null);
  const [measurementMap,setMeasurementMap]=useState<maplibregl.Map|null>(null);
  const [measureSelection,setMeasureSelection]=useState<{drawing:MeasureDrawing;name:string}|null>(null);
  const [measurementActive,setMeasurementActive]=useState(false),[startAreaRevision,setStartAreaRevision]=useState(0);
  const onMeasurementChange=useCallback((drawing:MeasureDrawing,name:string)=>setMeasureSelection({drawing,name}),[]);
  const [ready,setReady]=useState(false),[fallbackCoverage,setFallbackCoverage]=useState<Coverage|null>(null);
  const [basemap,setBasemap]=useState<BaseMap>("streets"),[layersOpen,setLayersOpen]=useState(false),[transparentOrtho,setTransparentOrtho]=useState<string|null>(null);
  const [orthoBusy,setOrthoBusy]=useState(false),[orthoError,setOrthoError]=useState("");
  const [orthoProgress,setOrthoProgress]=useState<OrthoLoadProgress|null>(null),[orthoRendered,setOrthoRendered]=useState(false),[orthoRetry,setOrthoRetry]=useState(0);
  const [dtmPreview,setDtmPreview]=useState<string|null>(null),[dsmPreview,setDsmPreview]=useState<string|null>(null),[processedSlope,setProcessedSlope]=useState<string|null>(null),[elevationBusy,setElevationBusy]=useState<string|null>(null),[elevationError,setElevationError]=useState("");
  const [dtmRange,setDtmRange]=useState<{min:number;max:number}|null>(null),[dsmRange,setDsmRange]=useState<{min:number;max:number}|null>(null);
  const [visible,setVisible]=useState<Record<string,boolean>>({orthophoto:true,contours:false,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false,project:false});
  const [dtmCorners,setDtmCorners]=useState<RasterCorners|null>(null),[dsmCorners,setDsmCorners]=useState<RasterCorners|null>(null),[slopeCorners,setSlopeCorners]=useState<RasterCorners|null>(null);
  const [contoursState,setContoursState]=useState<"loading"|"ready"|"error">("loading"),[contoursError,setContoursError]=useState("");
  const [contoursCount,setContoursCount]=useState(0);
  const camera=useRef<{center:Coord;zoom:number;bearing:number;pitch:number}|null>(null);
  const visibleRef=useRef(visible);
  useEffect(()=>{visibleRef.current=visible;},[visible]);
  const bounds=useMemo(()=>readBounds(results),[results]);
  const planCoverage=useMemo(()=>coverageFromPlan(planBoundary),[planBoundary]);
  const savedCoverage=useMemo(()=>storedCoverage(results),[results]);
  const coverage=planCoverage||savedCoverage||fallbackCoverage;
  const orthophoto=results.find(r=>r.kind==="orthophoto"&&r.preview_url);
  const orthoDisplayUrl=orthophoto?orthophotoPreviewUrl(orthophoto):null;
  const dtm=results.find(r=>r.kind==="dtm"&&r.download_url);
  const dsm=results.find(r=>r.kind==="dsm"&&r.download_url);


  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the external image loader when its URL changes.
    setTransparentOrtho(null);setOrthoError("");setOrthoProgress(null);setOrthoRendered(false);
    if(!orthoDisplayUrl){setOrthoBusy(false);return;}
    const controller=new AbortController();
    setOrthoBusy(true);
    prepareOrthophotoPreview(orthoDisplayUrl,controller.signal,progress=>{if(!controller.signal.aborted)setOrthoProgress(progress);}).then(url=>{
      if(!controller.signal.aborted)setTransparentOrtho(url);
    }).catch(error=>{
      if(!controller.signal.aborted)setOrthoError(error instanceof Error?error.message:"Não foi possível carregar a ortofoto.");
    }).finally(()=>{if(!controller.signal.aborted)setOrthoBusy(false);});
    return()=>controller.abort();
  },[orthoDisplayUrl,orthoRetry]);

  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reflect cancellation of the external raster preview loader.
    if(!visible.slope){setElevationBusy(v=>v==="slope"?null:v);return;}
    if(processedSlope)return;
    if(!dtm?.download_url){setElevationError("DTM indisponível para preparar a prévia de declividade. O arquivo original permanece nos downloads.");return;}
    let cancelled=false;
    setElevationBusy("slope");setElevationError("");
    renderGeoTiffToDataUrl(dtm.download_url,"slope").then(v=>{
      if(!cancelled){setProcessedSlope(v.url);setSlopeCorners(v.corners);}
    }).catch(e=>{if(!cancelled)setElevationError(e instanceof Error?e.message:"Não foi possível abrir a declividade.");})
      .finally(()=>{if(!cancelled)setElevationBusy(v=>v==="slope"?null:v);});
    return()=>{cancelled=true};
  },[visible.slope,dtm?.download_url,processedSlope]);

  useEffect(()=>{
    if(planCoverage||savedCoverage||!bounds||!transparentOrtho)return;
    let cancelled=false;
    deriveCoverage(transparentOrtho,bounds).then(v=>{if(!cancelled)setFallbackCoverage(v)}).catch(()=>{});
    return()=>{cancelled=true};
  },[planCoverage,savedCoverage,bounds,transparentOrtho]);

  useEffect(()=>{
    if(!focusKind)return;
    const next={orthophoto:false,contours:false,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false};
    if(focusKind==="contours"){next.orthophoto=true;next.contours=true;}
    else if(focusKind==="orthophoto")next.orthophoto=true;
    else if(focusKind==="dtm"){
      next.dtm=true;
      if(!dtmPreview&&dtm?.download_url){
        // eslint-disable-next-line react-hooks/set-state-in-effect -- The parent product-card command starts an asynchronous file preview.
        setElevationBusy("dtm");setElevationError("");
        renderGeoTiffToDataUrl(dtm.download_url,"dtm").then(v=>{setDtmPreview(v.url);setDtmRange({min:v.min,max:v.max});setDtmCorners(v.corners);}).catch(e=>setElevationError(e instanceof Error?e.message:"Não foi possível abrir o DTM no navegador.")).finally(()=>setElevationBusy(v=>v==="dtm"?null:v));
      }
    }else if(focusKind==="dsm"){
      next.dsm=true;
      if(!dsmPreview&&dsm?.download_url){
        setElevationBusy("dsm");setElevationError("");
        renderGeoTiffToDataUrl(dsm.download_url,"dsm").then(v=>{setDsmPreview(v.url);setDsmRange({min:v.min,max:v.max});setDsmCorners(v.corners);}).catch(e=>setElevationError(e instanceof Error?e.message:"Não foi possível abrir o DSM no navegador.")).finally(()=>setElevationBusy(v=>v==="dsm"?null:v));
      }
    }else if(focusKind in next)next[focusKind as keyof typeof next]=true;
    // Switching products must not silently enable the flight-plan outline.
    setVisible(v=>({...v,...next}));
    requestAnimationFrame(()=>el.current?.scrollIntoView({behavior:"smooth",block:"center"}));
  // A completed preview must not re-apply an older product-card selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[focusKind,focusRevision]);

  useEffect(()=>{
    if(!el.current||!bounds)return;
    setReady(false);setOrthoRendered(false);setContoursState("loading");setContoursError("");setContoursCount(0);
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const bm=baseMaps[basemap];
    const m=new maplibregl.Map({
      container:el.current,
      style:{
        version:8,
        sources:{basemap:{type:"raster",tiles:[bm.url],tileSize:256,maxzoom:bm.maxzoom,attribution:bm.attribution}},
        layers:[{id:"background",type:"background",paint:{"background-color":"#dfe8dc"}},{id:"basemap",type:"raster",source:"basemap"}],
      },
      center:camera.current?.center||[(bounds.west+bounds.east)/2,(bounds.south+bounds.north)/2],
      zoom:camera.current?.zoom??17,bearing:camera.current?.bearing??0,pitch:camera.current?.pitch??0,attributionControl:false,renderWorldCopies:false,
    });
    map.current=m;
    m.on("sourcedata",event=>{if(event.sourceId==="result-orthophoto"&&event.isSourceLoaded&&map.current===m)setOrthoRendered(true);});
    m.on("error",event=>{if("sourceId" in event&&event.sourceId==="result-orthophoto"&&map.current===m)setOrthoError("A prévia chegou, mas não foi possível desenhá-la no mapa. Tente novamente.");});
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
      if(dtmPreview){
        m.addSource("result-dtm",{type:"image",url:dtmPreview,coordinates:dtmCorners||corners});
        m.addLayer({id:"result-dtm",type:"raster",source:"result-dtm",paint:{"raster-opacity":1,"raster-fade-duration":0},layout:{visibility:current.dtm?"visible":"none"}});
      }
      if(dsmPreview){
        m.addSource("result-dsm",{type:"image",url:dsmPreview,coordinates:dsmCorners||corners});
        m.addLayer({id:"result-dsm",type:"raster",source:"result-dsm",paint:{"raster-opacity":1,"raster-fade-duration":0},layout:{visibility:current.dsm?"visible":"none"}});
      }
      if(!camera.current)m.fitBounds([[bounds.west,bounds.south],[bounds.east,bounds.north]],{padding:34,maxZoom:19});
      setMeasurementMap(m);setReady(true);
    });
    return()=>{camera.current={center:m.getCenter().toArray() as Coord,zoom:m.getZoom(),bearing:m.getBearing(),pitch:m.getPitch()};resizeObserver.disconnect();setReady(false);m.remove();if(map.current===m)map.current=null;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[results,bounds?.west,bounds?.south,bounds?.east,bounds?.north,basemap]);

  // Full-size files are not fetched for the map or product thumbnail.
  useEffect(()=>{
    const m=map.current;if(!m||!ready||!bounds||!transparentOrtho)return;
    const coordinates:RasterCorners=[[bounds.west,bounds.north],[bounds.east,bounds.north],[bounds.east,bounds.south],[bounds.west,bounds.south]];
    const source=m.getSource("result-orthophoto") as maplibregl.ImageSource|undefined;
    if(source)source.updateImage({url:transparentOrtho,coordinates});
    else{
      m.addSource("result-orthophoto",{type:"image",url:transparentOrtho,coordinates});
      const before=["result-hillshade","result-hypsometry","result-slope","result-dtm","result-dsm","result-contours","project-boundary-shadow"].find(id=>!!m.getLayer(id));
      m.addLayer({id:"result-orthophoto",type:"raster",source:"result-orthophoto",paint:{"raster-opacity":visibleRef.current.contours&&contoursState==="ready"?.58:1,"raster-fade-duration":0},layout:{visibility:visibleRef.current.orthophoto?"visible":"none"}},before);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ready,transparentOrtho,bounds]);

  // Do not download the 9.5 MB contour file before the user selects it.
  useEffect(()=>{
    const m=map.current;if(!m||!ready||!visible.contours||m.getSource("result-contours"))return;
    const controller=new AbortController();
      const contours=results.find(r=>r.kind==="contours"&&r.preview_url);
      if(contours?.preview_url)fetch(contours.preview_url,{signal:controller.signal}).then(r=>{
        if(!r.ok)throw new Error(`HTTP ${r.status} ao carregar curvas.`);
        return r.json();
      }).then(data=>{
        if(map.current!==m||controller.signal.aborted)return;
        if(data?.type!=="FeatureCollection"||!Array.isArray(data.features)||!data.features.length)throw new Error("O arquivo de curvas não contém linhas disponíveis.");
        if(!data.features.every((f:GeoJSON.Feature)=>f.geometry?.type==="LineString"||f.geometry?.type==="MultiLineString"))throw new Error("Geometria de curvas não reconhecida.");
        const count=data.features.length;
        const loaded=(event:maplibregl.MapSourceDataEvent)=>{
          if(event.sourceId==="result-contours"&&event.isSourceLoaded&&map.current===m){setContoursCount(count);setContoursState("ready");m.off("sourcedata",loaded);}
        };
        m.on("sourcedata",loaded);
        m.on("error",event=>{if("sourceId" in event&&event.sourceId==="result-contours"&&map.current===m){setContoursState("error");setContoursError("Não foi possível desenhar as curvas no mapa.");}});
        m.addSource("result-contours",{type:"geojson",data,tolerance:0.1});
        m.addLayer({id:"result-contours",type:"line",source:"result-contours",paint:{"line-color":"#ff7a00","line-width":1.35,"line-opacity":1},layout:{visibility:visibleRef.current.contours?"visible":"none"}});
      }).catch(e=>{if(map.current===m&&!controller.signal.aborted){setContoursState("error");setContoursError(e instanceof Error?e.message:"Falha ao abrir as curvas.");}});
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Report the unavailable external source selected by the user.
      else {setContoursState("error");setContoursError("Arquivo de curvas indisponível para visualização.");}
    return()=>controller.abort();
  },[ready,visible.contours,results]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready||!bounds)return;
    const coordinates:RasterCorners=[[bounds.west,bounds.north],[bounds.east,bounds.north],[bounds.east,bounds.south],[bounds.west,bounds.south]];
    for(const kind of ["hillshade","hypsometry"]){
      const item=results.find(r=>r.kind===kind&&r.preview_url),id=`result-${kind}`;
      if(!visible[kind]||!item?.preview_url||m.getSource(id))continue;
      m.addSource(id,{type:"image",url:item.preview_url,coordinates});
      const before=["result-contours","project-boundary-shadow"].find(layer=>!!m.getLayer(layer));
      m.addLayer({id,type:"raster",source:id,paint:{"raster-opacity":1,"raster-fade-duration":0},layout:{visibility:"visible"}},before);
    }
  },[ready,visible,results,bounds]);

  // Add previews without recreating the map, losing its camera or reloading the curves.
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const previews:[string,string|null,RasterCorners|null][]=[["dtm",dtmPreview,dtmCorners],["dsm",dsmPreview,dsmCorners],["slope",processedSlope,slopeCorners]];
    for(const [kind,url,coordinates] of previews){
      if(!url||!coordinates)continue;
      const id=`result-${kind}`,source=m.getSource(id) as maplibregl.ImageSource|undefined;
      if(source)source.updateImage({url,coordinates});
      else {
        m.addSource(id,{type:"image",url,coordinates});
        const before=["result-contours","project-boundary-shadow"].find(layer=>!!m.getLayer(layer));
        m.addLayer({id,type:"raster",source:id,paint:{"raster-opacity":1,"raster-fade-duration":0,"raster-resampling":kind==="slope"?"nearest":"linear"},layout:{visibility:visibleRef.current[kind]?"visible":"none"}},before);
      }
    }
  },[ready,dtmPreview,dsmPreview,processedSlope,dtmCorners,dsmCorners,slopeCorners]);

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
    if(m.getLayer("result-orthophoto"))m.setPaintProperty("result-orthophoto","raster-opacity",visible.contours&&contoursState==="ready"?0.58:1);
  },[visible,ready,contoursState]);

  function toggleLayer(key:string){
    setElevationError("");
    if(key==="project"||key==="contours"){setVisible(v=>({...v,[key]:!v[key]}));return;}
    setVisible(v=>({...v,orthophoto:false,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false,[key]:!v[key]}));
    if(key!=="dtm"&&key!=="dsm")return;
    if((key==="dtm"&&dtmPreview)||(key==="dsm"&&dsmPreview)||elevationBusy===key)return;
    const item=key==="dtm"?dtm:dsm;
    if(!item?.download_url){setElevationError(`Arquivo ${key.toUpperCase()} indisponível.`);return;}
    setElevationBusy(key);
    renderGeoTiffToDataUrl(item.download_url,key).then(v=>{
      if(key==="dtm"){setDtmPreview(v.url);setDtmRange({min:v.min,max:v.max});setDtmCorners(v.corners);}
      else{setDsmPreview(v.url);setDsmRange({min:v.min,max:v.max});setDsmCorners(v.corners);}
    }).catch(e=>setElevationError(e instanceof Error?e.message:`Não foi possível abrir ${key.toUpperCase()}.`))
      .finally(()=>setElevationBusy(v=>v===key?null:v));
  }

  if(!bounds)return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Os resultados existem, mas ainda não há limites geográficos suficientes para abrir o mapa.</div>;

  const controls=[["orthophoto","Ortofoto"],["project","Plano de voo"],["contours","Curvas 0,50 m"],["hillshade","Relevo sombreado"],["hypsometry","Hipsometria"],["slope","Declividade"],["dtm","DTM"],["dsm","DSM"]] as const;
  const projectArea=coverage?.areaM2??null,projectPerimeter=coverage?.perimeterM??null;

  return <div>
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {controls.map(([key,label])=><button key={key} type="button" aria-pressed={!!visible[key]} onClick={()=>toggleLayer(key)} aria-busy={elevationBusy===key||(key==="contours"&&visible.contours&&contoursState==="loading")} className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold ${visible[key]?"border-emerald-800 bg-emerald-900 text-white shadow-sm":"border-emerald-200 bg-white text-emerald-950"}`}>{elevationBusy===key?"Abrindo…":label}</button>)}
    </div>

    <div className="relative overflow-hidden rounded-[22px] border border-emerald-200 bg-slate-100 shadow-[0_10px_30px_rgba(22,63,45,.10)]">
      <div ref={el} className="h-[58vh] min-h-[440px] max-h-[720px] w-full" aria-label="Mapa dos resultados do processamento" data-ortho-preview="private-webp-v1" data-ortho-state={orthoError?"error":orthoRendered?"ready":"loading"} data-active-raster={[...rasterKinds,"dtm","dsm"].find(k=>visible[k])||"none"} data-layer-state={elevationBusy?"loading":elevationError?"error":"ready"} data-contour-state={contoursState} data-contour-count={contoursCount}/>
      {visible.orthophoto&&(orthoBusy||(!orthoRendered&&!!transparentOrtho))&&!orthoError&&<div role="status" className="absolute left-16 right-16 top-3 z-10 rounded-xl bg-white/95 p-3 text-center text-xs text-emerald-950 shadow">
        <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent"/>
        {orthoProgress?.phase==="download"?`Recebendo prévia: ${Math.round(orthoProgress.loaded/1024)} KB${orthoProgress.total?" / "+Math.round(orthoProgress.total/1024)+" KB":""}`:orthoProgress?.phase==="prepare"?"Preparando imagem no mapa…":orthoProgress?.phase==="ready"?"Exibindo ortofoto…":"Carregando prévia leve da ortofoto…"}
      </div>}
      {orthoError&&visible.orthophoto&&<div role="alert" className="absolute left-16 right-16 top-3 z-10 rounded-xl bg-amber-50/95 p-3 text-xs text-amber-950 shadow"><p>{orthoError}</p><button type="button" onClick={()=>setOrthoRetry(v=>v+1)} className="mt-2 rounded-lg border border-amber-700 px-3 py-1 font-semibold">Tentar novamente</button></div>}
      {elevationBusy&&<div role="status" className="absolute left-16 right-16 top-3 z-10 rounded-xl bg-white/95 px-3 py-2 text-center text-xs font-medium text-emerald-950 shadow">Preparando {elevationBusy==="slope"?"declividade":elevationBusy.toUpperCase()}…</div>}
      {visible.contours&&contoursState!=="ready"&&<div role={contoursState==="error"?"alert":"status"} className="absolute bottom-10 left-3 right-3 z-10 rounded-xl bg-white/95 px-3 py-2 text-xs text-amber-950 shadow">{contoursState==="error"?contoursError:"Carregando linhas de nível…"}</div>}
      {visible.slope&&processedSlope&&!measurementActive&&<div style={{pointerEvents:"none"}} aria-label="Legenda de declividade" className="absolute bottom-10 right-3 z-10 max-w-[230px] rounded-xl border border-white bg-white/95 p-3 text-[10px] text-slate-800 shadow-md">
        <strong className="text-xs">Declividade (%)</strong><div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">{SLOPE_CLASSES.map(c=><span key={c.label} className="flex items-center gap-1"><i className="h-2.5 w-3 rounded-sm" style={{background:c.color}}/>{c.label}</span>)}</div>
        <p className="mt-2">Prévia calculada do DTM na grade original. Sem dados: transparente.</p>
      </div>}
      {!measurementActive&&((visible.dtm&&dtmRange)||(visible.dsm&&dsmRange))&&(()=>{const r=visible.dtm?dtmRange!:dsmRange!;return <div style={{pointerEvents:"none"}} aria-label="Legenda de elevação" className="absolute bottom-10 right-3 z-10 w-48 rounded-xl border border-white bg-white/95 p-3 text-[10px] text-slate-800 shadow-md"><strong className="text-xs">{visible.dtm?"DTM · terreno":"DSM · superfície"} (m)</strong><div className="mb-1 mt-2 h-2 rounded-full" style={{background:visible.dtm?"linear-gradient(90deg,#225e39,#689e4c,#c2c256,#dc9548,#845037)":"linear-gradient(90deg,#2c5fa0,#3a97b0,#5ba878,#d7be52,#b65240)"}}/><div className="flex justify-between"><span>{r.min.toLocaleString("pt-BR",{maximumFractionDigits:2})} m</span><span>{r.max.toLocaleString("pt-BR",{maximumFractionDigits:2})} m</span></div><p className="mt-1">Escala dos pixels válidos. Sem dados: transparente.</p></div>;})()}
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
          <label className="flex items-center justify-between gap-3 py-1.5"><span>Ortofoto</span><input type="checkbox" checked={!!visible.orthophoto} onChange={()=>toggleLayer("orthophoto")}/></label>
          <label className="flex items-center justify-between gap-3 py-1.5"><span>Plano de voo</span><input type="checkbox" checked={!!visible.project} onChange={()=>setVisible(v=>({...v,project:!v.project}))}/></label>
          <label className="flex items-center justify-between gap-3 py-1.5"><span>Curvas</span><input type="checkbox" checked={!!visible.contours} onChange={()=>setVisible(v=>({...v,contours:!v.contours}))}/></label>
        </div>}
      </div>
    </div>

    <SlopeInspector key={dtm?.id||"no-dtm"} map={ready?measurementMap:null} source={dtm||null} slopeVisible={!!visible.slope} selection={measureSelection} measuring={measurementActive} onDrawArea={()=>{setStartAreaRevision(v=>v+1);requestAnimationFrame(()=>el.current?.scrollIntoView({behavior:"smooth",block:"center"}));}}/>
    <MapMeasurement map={ready?measurementMap:null} surveyId={results[0]?.survey_id||null} onActiveChange={setMeasurementActive} onDrawingChange={onMeasurementChange} startAreaRevision={startAreaRevision}/>

    {(projectArea!==null||projectPerimeter!==null)&&<div className="mt-4 grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-emerald-100 bg-[#f4f8ef] p-4"><span className="text-xs font-medium text-slate-500">Área do plano</span><strong className="mt-1 block text-xl text-slate-950">{projectArea!==null?(projectArea/10000).toLocaleString("pt-BR",{maximumFractionDigits:2})+" ha":"—"}</strong>{projectArea!==null&&<small className="text-[11px] text-slate-500">{projectArea.toLocaleString("pt-BR",{maximumFractionDigits:0})} m²</small>}</div>
      <div className="rounded-2xl border border-emerald-100 bg-[#f4f8ef] p-4"><span className="text-xs font-medium text-slate-500">Perímetro</span><strong className="mt-1 block text-xl text-slate-950">{projectPerimeter!==null?projectPerimeter.toLocaleString("pt-BR",{maximumFractionDigits:0})+" m":"—"}</strong></div>
    </div>}

    {orthoError&&<div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{orthoError}</div>}
    {elevationError&&<div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{elevationError}</div>}
    {visible.contours&&contoursState==="ready"&&<div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900"><strong>Curvas de nível 0,50 m · {contoursCount.toLocaleString("pt-BR")} linhas carregadas.</strong> Cada linha representa a mesma cota de terreno; a ortofoto fica mais transparente para destacar as curvas.</div>}
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

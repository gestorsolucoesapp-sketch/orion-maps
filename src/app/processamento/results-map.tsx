"use client";
import MapMeasurement from "@/components/measurement/map-measurement";
import type {MeasurementImageSource} from "@/components/measurement/actions";
import {EMPTY_TERRAIN_FEEDBACK,type MapMeasureTool,type TerrainToolFeedback,type TerrainToolCommand,type TerrainToolAction} from "@/lib/map-toolbox";


import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import SlopeInspector from "./slope-inspector";
import type {MeasureDrawing} from "@/lib/map-measurement";
import * as maplibregl from "maplibre-gl";
import type {GeoJSONSource} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {ProcessingResult} from "@/lib/supabase/processing-results";
import type {ClipPoint} from "@/lib/orthophoto-clip";
import {clipDrawingGeoJson} from "@/lib/orthophoto-clip-flow";
import {renderGeoTiffToDataUrl, type RasterCorners} from "./geotiff-preview";
import {SLOPE_CLASSES} from "@/lib/terrain-preview";
import {prepareOrthophotoPreview,type OrthoLoadProgress} from "./orthophoto-preview";
import {orthophotoPreviewUrl} from "@/lib/orthophoto-preview-url";
import {freshProcessingUrl} from "@/lib/processing-fresh-url";
import {streetBasemap,esriImagery,reliefBasemap} from "@/lib/basemaps";
import {alignedCorners,dragTranslation,transformPreviewPoint,translateCorners,type AlignmentPair} from "@/lib/visual-alignment";
import type {VisualReferencePoint} from "@/lib/survey-planning";
import {changeResultReference} from "./reference-actions";
import {getMetadata,getWaybackItems,type WaybackItem,type WaybackMetadata} from "@esri/wayback-core";
import BeforeAfterRecorder from "./before-after-recorder";

type Bounds={west:number;south:number;east:number;north:number};
type Coord=[number,number];
type Coverage={feature:GeoJSON.Feature<GeoJSON.Polygon>;areaM2:number;perimeterM:number};
function waybackTileUrl(item:WaybackItem){
  const url=new URL(item.itemURL);
  if(!/^wayback(?:-[ab])?\.maptiles\.arcgis\.com$/.test(url.hostname)||url.protocol!=="https:")throw new Error("Endereço do mapa histórico inválido.");
  if(!item.itemURL.includes("{level}/{row}/{col}"))throw new Error("Formato do mapa histórico inválido.");
  return item.itemURL.replace("{level}","{z}").replace("{row}","{y}").replace("{col}","{x}");
}
function historicalDate(value:number|undefined){return value&&Number.isFinite(value)?new Date(value).toLocaleDateString("pt-BR",{timeZone:"UTC"}):null;}
const EMPTY_REFERENCE_POINTS:VisualReferencePoint[]=[];
const EMPTY_FLIGHT_LEGS:Coord[][]=[];
type Props={
  results:ProcessingResult[];
  surveyId?:string;
  projectName?:string;
  flightDate?:string|null;
  planBoundary?:{name:string;points:Coord[];legs?:Coord[][]}|null;
  referencePoints?:VisualReferencePoint[];
  onReferencePointsChange?:(points:VisualReferencePoint[])=>void;
  focusKind?:string|null;
  focusRevision?:number;
  privateMode?:boolean;
  clipUrl?:string|null;
  clipPoints?:ClipPoint[];
  clipEditing?:boolean;
  clipDrawing?:boolean;
  onClipPointsChange?:(points:ClipPoint[])=>void;
};

const rasterKinds=["orthophoto","hillshade","hypsometry","slope"] as const;
const baseMaps={
  satellite:esriImagery,streets:streetBasemap,relief:reliefBasemap
};
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

export default function ResultsMap({results,surveyId,projectName="Levantamento",flightDate,planBoundary,referencePoints=EMPTY_REFERENCE_POINTS,onReferencePointsChange,focusKind,focusRevision,privateMode=false,clipUrl=null,clipPoints=[],clipEditing=false,clipDrawing=false,onClipPointsChange}:Props){
  const el=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null);
  const [measurementMap,setMeasurementMap]=useState<maplibregl.Map|null>(null);
  const [alignment,setAlignment]=useState<AlignmentPair[]>([]),[alignmentLoadedKey,setAlignmentLoadedKey]=useState<string|null>(null),[aligningId,setAligningId]=useState<string|null>(null);
  const [savedOffset,setSavedOffset]=useState<Coord>([0,0]),[draftOffset,setDraftOffset]=useState<Coord>([0,0]),[dragMode,setDragMode]=useState(false);
  const [dragFeedback,setDragFeedback]=useState("");
  const [alignmentStatus,setAlignmentStatus]=useState<{matched:number;total:number}|null>(null);
  const [placingReference,setPlacingReference]=useState(false),[showReferences,setShowReferences]=useState(true),[referenceBusy,setReferenceBusy]=useState(false),[referenceMessage,setReferenceMessage]=useState("");
  const draftOffsetRef=useRef<Coord>([0,0]);
  const alignmentKey=`orion-visual-alignment-v2:${results[0]?.job_id??"none"}`;
  const legacyAlignmentKey=`orion-visual-alignment-v1:${results[0]?.job_id??"none"}`;
  const [measureSelection,setMeasureSelection]=useState<{drawing:MeasureDrawing;name:string}|null>(null);
  const [measurementActive,setMeasurementActive]=useState(false),[startAreaRevision,setStartAreaRevision]=useState(0),[startPathRevision,setStartPathRevision]=useState(0);
  const [areaImageSource,setAreaImageSource]=useState<MeasurementImageSource|null>(null);
  const onMeasurementChange=useCallback((drawing:MeasureDrawing,name:string)=>setMeasureSelection({drawing,name}),[]);
  const [mapTool,setMapTool]=useState<MapMeasureTool|null>(null),[terrainFeedback,setTerrainFeedback]=useState<TerrainToolFeedback>(EMPTY_TERRAIN_FEEDBACK);
  const [terrainCommand,setTerrainCommand]=useState<TerrainToolCommand|null>(null);
  const onTerrainAction=useCallback((action:TerrainToolAction)=>setTerrainCommand(v=>({sequence:(v?.sequence||0)+1,action})),[]);
  const [ready,setReady]=useState(false),[fallbackCoverage,setFallbackCoverage]=useState<Coverage|null>(null);
  const [basemap,setBasemap]=useState<BaseMap>("satellite"),[layersOpen,setLayersOpen]=useState(false),[transparentOrtho,setTransparentOrtho]=useState<string|null>(null),[comparePercent,setComparePercent]=useState(100);
  const [historyOpen,setHistoryOpen]=useState(false),[historyBusy,setHistoryBusy]=useState(false),[historyError,setHistoryError]=useState("");
  const [historyItems,setHistoryItems]=useState<WaybackItem[]>([]),[historyChoice,setHistoryChoice]=useState<WaybackItem|null>(null);
  const [historyMetadata,setHistoryMetadata]=useState<WaybackMetadata|null>(null),[historyPoint,setHistoryPoint]=useState<{longitude:number;latitude:number;zoom:number}|null>(null);
  const [recordingVideo,setRecordingVideo]=useState(false);
  const [orthoBusy,setOrthoBusy]=useState(false),[orthoError,setOrthoError]=useState("");
  const [orthoProgress,setOrthoProgress]=useState<OrthoLoadProgress|null>(null),[orthoRendered,setOrthoRendered]=useState(false),[orthoRetry,setOrthoRetry]=useState(0);
  const [dtmPreview,setDtmPreview]=useState<string|null>(null),[dsmPreview,setDsmPreview]=useState<string|null>(null),[processedSlope,setProcessedSlope]=useState<string|null>(null),[elevationBusy,setElevationBusy]=useState<string|null>(null),[elevationError,setElevationError]=useState("");
  const [dtmRange,setDtmRange]=useState<{min:number;max:number}|null>(null),[dsmRange,setDsmRange]=useState<{min:number;max:number}|null>(null);
  const [visible,setVisible]=useState<Record<string,boolean>>({orthophoto:true,contours:false,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false,project:false,flightRoute:false});
  const [dtmCorners,setDtmCorners]=useState<RasterCorners|null>(null),[dsmCorners,setDsmCorners]=useState<RasterCorners|null>(null),[slopeCorners,setSlopeCorners]=useState<RasterCorners|null>(null);
  const [contoursState,setContoursState]=useState<"loading"|"ready"|"error">("loading"),[contoursError,setContoursError]=useState("");
  const [contoursCount,setContoursCount]=useState(0);
  const camera=useRef<{center:Coord;zoom:number;bearing:number;pitch:number}|null>(null);
  const visibleRef=useRef(visible);
  useEffect(()=>{visibleRef.current=visible;},[visible]);
  useEffect(()=>{draftOffsetRef.current=draftOffset;},[draftOffset]);
  const bounds=useMemo(()=>readBounds(results),[results]);
  const alignmentView=useMemo(()=>{
    if(!bounds)return {corners:null,error:""};
    const original:RasterCorners=[[bounds.west,bounds.north],[bounds.east,bounds.north],[bounds.east,bounds.south],[bounds.west,bounds.south]];
    if(privateMode||aligningId)return {corners:original,error:""};
    try{return {corners:translateCorners(alignedCorners(original,alignment,referencePoints),dragMode?draftOffset:savedOffset) as RasterCorners,error:""};}
    catch(e){return {corners:original,error:e instanceof Error?e.message:"Correspondências inválidas."};}
  },[bounds,privateMode,aligningId,alignment,referencePoints,dragMode,draftOffset,savedOffset]);
  const measurementTransform=useMemo(()=>bounds&&alignmentView.corners?{original:[[bounds.west,bounds.north],[bounds.east,bounds.north],[bounds.east,bounds.south],[bounds.west,bounds.south]] as RasterCorners,aligned:alignmentView.corners}:null,[bounds,alignmentView.corners]);
  const planCoverage=useMemo(()=>coverageFromPlan(planBoundary),[planBoundary]);
  const flightLegs=planBoundary?.legs??EMPTY_FLIGHT_LEGS;
  const savedCoverage=useMemo(()=>storedCoverage(results),[results]);
  const coverage=planCoverage||savedCoverage||fallbackCoverage;
  const orthophoto=results.find(r=>r.kind==="orthophoto"&&r.preview_url);
  const orthoDisplayUrl=privateMode?clipUrl:orthophoto?orthophotoPreviewUrl(orthophoto):null;
  const dtm=results.find(r=>r.kind==="dtm");
  const dsm=results.find(r=>r.kind==="dsm");
  const visualAdjusted=dragMode||alignment.length>0||savedOffset.some(v=>v!==0);

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(alignmentKey)??localStorage.getItem(legacyAlignmentKey),value=raw?JSON.parse(raw):[];
      const pairs=Array.isArray(value)?value:Array.isArray(value?.pairs)?value.pairs:[];
      const offset=value?.offset;
      const validOffset:Array<number>=Array.isArray(offset)&&offset.length===2&&offset.every((n:unknown)=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<=1000)?offset:[0,0];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore a browser-only visual preference after hydration.
      setAlignment(pairs.filter((pair:unknown)=>{const p=pair as AlignmentPair;return !!p&&typeof p.id==="string"&&referencePoints.some(ref=>ref.id===p.id)&&Array.isArray(p.source)&&p.source.length===2&&p.source.every((v,i)=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<=(i===0?180:85));}).slice(0,2));
      setSavedOffset(validOffset as Coord);setDraftOffset(validOffset as Coord);
    }catch{setAlignment([]);setSavedOffset([0,0]);setDraftOffset([0,0]);}
    setAlignmentLoadedKey(alignmentKey);
  },[alignmentKey,legacyAlignmentKey,referencePoints]);
  useEffect(()=>{if(alignmentLoadedKey===alignmentKey)try{localStorage.setItem(alignmentKey,JSON.stringify({pairs:alignment,offset:savedOffset}));}catch{/* Browser storage can be disabled. */}},[alignmentKey,alignment,savedOffset,alignmentLoadedKey]);


  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the external image loader when its URL changes.
    setTransparentOrtho(null);setOrthoError("");setOrthoProgress(null);setOrthoRendered(false);
    const oldMap=map.current;
    if(oldMap?.getLayer("result-orthophoto"))oldMap.removeLayer("result-orthophoto");
    if(oldMap?.getSource("result-orthophoto"))oldMap.removeSource("result-orthophoto");
    if(!orthoDisplayUrl){setOrthoBusy(false);return;}
    const controller=new AbortController();
    setOrthoBusy(true);
    (privateMode?Promise.resolve(orthoDisplayUrl):prepareOrthophotoPreview(orthoDisplayUrl,controller.signal,progress=>{if(!controller.signal.aborted)setOrthoProgress(progress);})).then(url=>{
      if(!controller.signal.aborted)setTransparentOrtho(url);
    }).catch(error=>{
      if(!controller.signal.aborted)setOrthoError(error instanceof Error?error.message:"Não foi possível carregar a ortofoto.");
    }).finally(()=>{if(!controller.signal.aborted)setOrthoBusy(false);});
    return()=>controller.abort();
  },[orthoDisplayUrl,orthoRetry,privateMode]);

  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reflect cancellation of the external raster preview loader.
    if(!visible.slope){setElevationBusy(v=>v==="slope"?null:v);return;}
    if(processedSlope)return;
    if(!dtm){setElevationError("DTM indisponível para preparar a prévia de declividade. O arquivo original permanece nos downloads.");return;}
    let cancelled=false;
    setElevationBusy("slope");setElevationError("");
    freshProcessingUrl(dtm,"download").then(url=>renderGeoTiffToDataUrl(url,"slope")).then(v=>{
      if(!cancelled){setProcessedSlope(v.url);setSlopeCorners(v.corners);}
    }).catch(e=>{if(!cancelled)setElevationError(e instanceof Error?e.message:"Não foi possível abrir a declividade.");})
      .finally(()=>{if(!cancelled)setElevationBusy(v=>v==="slope"?null:v);});
    return()=>{cancelled=true};
  },[visible.slope,dtm,processedSlope]);

  useEffect(()=>{
    if(privateMode||planCoverage||savedCoverage||!bounds||!transparentOrtho)return;
    let cancelled=false;
    deriveCoverage(transparentOrtho,bounds).then(v=>{if(!cancelled)setFallbackCoverage(v)}).catch(()=>{});
    return()=>{cancelled=true};
  },[privateMode,planCoverage,savedCoverage,bounds,transparentOrtho]);

  useEffect(()=>{
    if(!focusKind)return;
    const next={orthophoto:false,contours:false,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false};
    if(focusKind==="contours"){next.orthophoto=true;next.contours=true;}
    else if(focusKind==="orthophoto"){
      next.orthophoto=true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- A product-card selection resets the comparison to the complete orthophoto.
      setComparePercent(100);
    }
    else if(focusKind==="dtm"){
      next.dtm=true;
      if(!dtmPreview&&dtm){
        setElevationBusy("dtm");setElevationError("");
        freshProcessingUrl(dtm,"download").then(url=>renderGeoTiffToDataUrl(url,"dtm")).then(v=>{setDtmPreview(v.url);setDtmRange({min:v.min,max:v.max});setDtmCorners(v.corners);}).catch(e=>setElevationError(e instanceof Error?e.message:"Não foi possível abrir o DTM no navegador.")).finally(()=>setElevationBusy(v=>v==="dtm"?null:v));
      }
    }else if(focusKind==="dsm"){
      next.dsm=true;
      if(!dsmPreview&&dsm){
        setElevationBusy("dsm");setElevationError("");
        freshProcessingUrl(dsm,"download").then(url=>renderGeoTiffToDataUrl(url,"dsm")).then(v=>{setDsmPreview(v.url);setDsmRange({min:v.min,max:v.max});setDsmCorners(v.corners);}).catch(e=>setElevationError(e instanceof Error?e.message:"Não foi possível abrir o DSM no navegador.")).finally(()=>setElevationBusy(v=>v==="dsm"?null:v));
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
    const bm=baseMaps[basemap]??esriImagery;
    const m=new maplibregl.Map({
      container:el.current,
      style:{
        version:8,
        sources:{basemap:{type:"raster",tiles:[bm.url],tileSize:256,maxzoom:bm.maxzoom,attribution:bm.attribution}},
        layers:[{id:"background",type:"background",paint:{"background-color":"#dfe8dc"}},{id:"basemap",type:"raster",source:"basemap"}],
      },
      center:camera.current?.center||[(bounds.west+bounds.east)/2,(bounds.south+bounds.north)/2],
      zoom:camera.current?.zoom??17,bearing:camera.current?.bearing??0,pitch:camera.current?.pitch??0,attributionControl:false,renderWorldCopies:false,canvasContextAttributes:{preserveDrawingBuffer:true},
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
  },[results,bounds?.west,bounds?.south,bounds?.east,bounds?.north,basemap,privateMode]);

  // Full-size files are not fetched for the map or product thumbnail.
  useEffect(()=>{
    const m=map.current;if(!m||!ready||!bounds||!transparentOrtho)return;
    const coordinates=alignmentView.corners;
    if(!coordinates)return;
    const source=m.getSource("result-orthophoto") as maplibregl.ImageSource|undefined;
    if(source)source.setCoordinates(coordinates);
    else{
      m.addSource("result-orthophoto",{type:"image",url:transparentOrtho,coordinates});
      const before=["result-hillshade","result-hypsometry","result-slope","result-dtm","result-dsm","result-contours","project-boundary-shadow","privacy-cutline"].find(id=>!!m.getLayer(id));
      m.addLayer({id:"result-orthophoto",type:"raster",source:"result-orthophoto",paint:{"raster-opacity":dragMode?0.5:Math.min(comparePercent/100,visibleRef.current.contours&&contoursState==="ready"?.58:1),"raster-fade-duration":0},layout:{visibility:visibleRef.current.orthophoto?"visible":"none"}},before);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ready,transparentOrtho,bounds,alignmentView]);

  // Do not download the 9.5 MB contour file before the user selects it.
  useEffect(()=>{
    const m=map.current;if(!m||!ready||!visible.contours||m.getSource("result-contours"))return;
    const controller=new AbortController();
      const contours=results.find(r=>r.kind==="contours"&&r.preview_url);
      if(contours)freshProcessingUrl(contours,"preview").then(url=>fetch(url,{signal:controller.signal})).then(r=>{
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
        m.addLayer({id:"result-contours",type:"line",source:"result-contours",paint:{"line-color":"#ff7a00","line-width":1.35,"line-opacity":1},layout:{visibility:visibleRef.current.contours?"visible":"none"}},m.getLayer("privacy-cutline")?"privacy-cutline":undefined);
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
      if(!visible[kind]||!item||m.getSource(id))continue;
      void freshProcessingUrl(item,"preview").then(url=>{
        if(map.current!==m||m.getSource(id))return;
        m.addSource(id,{type:"image",url,coordinates});
        const before=["result-contours","project-boundary-shadow","privacy-cutline"].find(layer=>!!m.getLayer(layer));
        m.addLayer({id,type:"raster",source:id,paint:{"raster-opacity":1,"raster-fade-duration":0},layout:{visibility:visibleRef.current[kind]?"visible":"none"}},before);
      }).catch(e=>{if(map.current===m)setElevationError(e instanceof Error?e.message:"Não foi possível abrir a camada.");});
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
        const before=["result-contours","project-boundary-shadow","privacy-cutline"].find(layer=>!!m.getLayer(layer));
        m.addLayer({id,type:"raster",source:id,paint:{"raster-opacity":1,"raster-fade-duration":0,"raster-resampling":kind==="slope"?"nearest":"linear"},layout:{visibility:visibleRef.current[kind]?"visible":"none"}},before);
      }
    }
  },[ready,dtmPreview,dsmPreview,processedSlope,dtmCorners,dsmCorners,slopeCorners]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready||!coverage)return;
    if(!m.getSource("project-boundary")){
      m.addSource("project-boundary",{type:"geojson",data:coverage.feature});
      const before=m.getLayer("privacy-cutline")?"privacy-cutline":undefined;
      m.addLayer({id:"project-boundary-shadow",type:"line",source:"project-boundary",paint:{"line-color":"#15252a","line-width":4.5,"line-opacity":0.82},layout:{visibility:visible.project?"visible":"none"}},before);
      m.addLayer({id:"project-boundary-line",type:"line",source:"project-boundary",paint:{"line-color":"#ffffff","line-width":2.6,"line-dasharray":[2.2,1.7],"line-opacity":1},layout:{visibility:visible.project?"visible":"none"}},before);
    }else (m.getSource("project-boundary") as GeoJSONSource).setData(coverage.feature);
  },[ready,coverage,visible.project]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready||!flightLegs.length)return;
    const route=flightLegs.filter(leg=>leg.length>=2).flat();
    const data:GeoJSON.FeatureCollection<GeoJSON.LineString>={type:"FeatureCollection",features:route.length>=2?[{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:route}}]:[]};
    if(!m.getSource("saved-flight-route")){
      m.addSource("saved-flight-route",{type:"geojson",data});
      const before=m.getLayer("privacy-cutline")?"privacy-cutline":undefined;
      m.addLayer({id:"saved-flight-route-halo",type:"line",source:"saved-flight-route",paint:{"line-color":"#17221d","line-width":2,"line-opacity":0.7},layout:{visibility:visible.flightRoute?"visible":"none"}},before);
      m.addLayer({id:"saved-flight-route-line",type:"line",source:"saved-flight-route",paint:{"line-color":"#f9d943","line-width":1.25,"line-opacity":1},layout:{visibility:visible.flightRoute?"visible":"none"}},before);
    }else (m.getSource("saved-flight-route") as GeoJSONSource).setData(data);
  },[ready,flightLegs,visible.flightRoute]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const data=clipDrawingGeoJson(clipPoints);
    const source=m.getSource("privacy-cutline") as GeoJSONSource|undefined;
    if(source)source.setData(data);
    else{
      m.addSource("privacy-cutline",{type:"geojson",data});
      m.addLayer({id:"privacy-cutline",type:"line",source:"privacy-cutline",paint:{"line-color":"#facc15","line-width":3,"line-dasharray":[2,1]},layout:{visibility:clipEditing?"visible":"none"}});
    }
    m.setLayoutProperty("privacy-cutline","visibility",clipEditing?"visible":"none");
    if(clipEditing)m.moveLayer("privacy-cutline");
  },[ready,clipPoints,clipEditing]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready||!clipEditing||!onClipPointsChange)return;
    const markers=clipPoints.map((point,index)=>{
      const element=document.createElement("button");element.type="button";element.className="h-8 w-8 touch-none rounded-full border-2 border-emerald-950 bg-yellow-300 shadow";
      element.setAttribute("aria-label",`Vértice do recorte ${index+1}; arraste para ajustar`);
      const marker=new maplibregl.Marker({element,draggable:true}).setLngLat(point).addTo(m);
      marker.on("dragend",()=>{const p=marker.getLngLat();const next=[...clipPoints];next[index]=[p.lng,p.lat];onClipPointsChange(next);});
      element.addEventListener("click",e=>e.stopPropagation());
      return marker;
    });
    const click=(event:maplibregl.MapMouseEvent)=>{
      if(!clipDrawing||(event.originalEvent.target as Element)?.closest("button,.maplibregl-control-container"))return;
      onClipPointsChange([...clipPoints,[event.lngLat.lng,event.lngLat.lat]]);
    };
    m.on("click",click);
    return()=>{m.off("click",click);markers.forEach(marker=>marker.remove());};
  },[ready,clipEditing,clipDrawing,clipPoints,onClipPointsChange]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready||privateMode||!showReferences||!bounds||!alignmentView.corners)return;
    const original:RasterCorners=[[bounds.west,bounds.north],[bounds.east,bounds.north],[bounds.east,bounds.south],[bounds.west,bounds.south]];
    const matches=new Map<string,{position:Coord;close:boolean}>();
    if(dragMode){
      for(const pair of alignment){
        const ref=referencePoints.find(item=>item.id===pair.id);
        if(!ref)continue;
        const position=transformPreviewPoint(pair.source,original,alignmentView.corners);
        const sourcePixel=m.project(position),targetPixel=m.project(ref.point);
        matches.set(ref.id,{position,close:Math.hypot(sourcePixel.x-targetPixel.x,sourcePixel.y-targetPixel.y)<=5});
      }
    }
    setAlignmentStatus(current=>{
      const next=dragMode?{matched:[...matches.values()].filter(value=>value.close).length,total:matches.size}:null;
      return current?.matched===next?.matched&&current?.total===next?.total?current:next;
    });
    const markers=referencePoints.map((ref,index)=>{
      const element=document.createElement("div");
      const color=matches.get(ref.id)?.close?"#15803d":"#b45309";
      element.innerHTML=`<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 2v18M2 11h18" stroke="white" stroke-width="4"/><path d="M11 2v18M2 11h18" stroke="${color}" stroke-width="1.5"/></svg>`;
      element.title=`Cruz ${index+1} do mapa de referência`;
      element.style.cssText="display:grid;place-items:center;width:22px;height:22px;pointer-events:none";
      return new maplibregl.Marker({element}).setLngLat(ref.point).addTo(m);
    });
    if(dragMode)for(const match of matches.values()){
      const element=document.createElement("div");element.title="Ponto correspondente na ortofoto";
      element.style.cssText=`width:13px;height:13px;border:2px solid ${match.close?"#15803d":"#2563eb"};border-radius:50%;background:white;box-shadow:0 0 0 1px white;pointer-events:none`;
      markers.push(new maplibregl.Marker({element}).setLngLat(match.position).addTo(m));
    }
    return()=>markers.forEach(marker=>marker.remove());
  },[ready,referencePoints,privateMode,showReferences,bounds,alignmentView.corners,alignment,dragMode]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready||!placingReference||privateMode)return;
    m.getCanvas().style.cursor="crosshair";
    const click=(event:maplibregl.MapMouseEvent)=>{
      if((event.originalEvent.target as Element)?.closest("button,.maplibregl-control-container"))return;
      setPlacingReference(false);setReferenceBusy(true);setReferenceMessage("");
      changeResultReference(surveyId??"",{kind:"add",point:[event.lngLat.lng,event.lngLat.lat]}).then(points=>{
        onReferencePointsChange?.(points);setShowReferences(true);setReferenceMessage("Cruz salva no levantamento. Mostre a ortofoto e marque o mesmo ponto nela.");
      }).catch(error=>setReferenceMessage(error instanceof Error?error.message:"Não foi possível salvar a cruz.")).finally(()=>setReferenceBusy(false));
    };
    m.on("click",click);
    return()=>{m.off("click",click);m.getCanvas().style.cursor="";};
  },[ready,placingReference,privateMode,surveyId,onReferencePointsChange]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready||!aligningId||privateMode)return;
    m.getCanvas().style.cursor="crosshair";
    const click=(event:maplibregl.MapMouseEvent)=>{
      if((event.originalEvent.target as Element)?.closest("button,.maplibregl-control-container"))return;
      setAlignment(current=>[...current.filter(pair=>pair.id!==aligningId),{id:aligningId,source:[event.lngLat.lng,event.lngLat.lat] as Coord}].slice(-2));
      setAligningId(null);
    };
    m.on("click",click);
    return()=>{m.off("click",click);m.getCanvas().style.cursor="";};
  },[ready,aligningId,privateMode]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready||!dragMode||privateMode)return;
    const panEnabled=m.dragPan.isEnabled();
    m.dragPan.disable();
    m.getCanvas().style.cursor="grab";
    let start:{point:Coord;offset:Coord}|null=null;
    const down=(event:maplibregl.MapMouseEvent)=>{
      if(event.originalEvent.button!==0||(event.originalEvent.target as Element)?.closest("button,.maplibregl-control-container"))return;
      const p=m.unproject(event.point);
      start={point:[p.lng,p.lat],offset:draftOffsetRef.current};
      m.getCanvas().style.cursor="grabbing";
      event.originalEvent.preventDefault();
    };
    const move=(event:maplibregl.MapMouseEvent)=>{
      if(!start)return;
      const p=m.unproject(event.point),delta=dragTranslation(start.point,[p.lng,p.lat]);
      const next:Coord=[start.offset[0]+delta[0],start.offset[1]+delta[1]];
      if(Math.hypot(...next)<=1000){draftOffsetRef.current=next;setDraftOffset(next);}
    };
    const up=()=>{start=null;m.getCanvas().style.cursor="grab";};
    m.on("mousedown",down);m.on("mousemove",move);m.on("mouseup",up);
    window.addEventListener("mouseup",up);
    return()=>{m.off("mousedown",down);m.off("mousemove",move);m.off("mouseup",up);window.removeEventListener("mouseup",up);if(panEnabled)m.dragPan.enable();m.getCanvas().style.cursor="";};
  },[ready,dragMode,privateMode]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const source=m.getSource("basemap") as maplibregl.RasterTileSource|undefined;
    if(!source)return;
    source.setTiles([basemap==="satellite"&&historyChoice?waybackTileUrl(historyChoice):baseMaps[basemap].url]);
  },[ready,basemap,historyChoice]);

  useEffect(()=>{
    if(!historyChoice||!historyPoint)return;
    const controller=new AbortController();
    // Metadata describes the image at the searched point, not the release date.
    getMetadata({longitude:historyPoint.longitude,latitude:historyPoint.latitude},historyPoint.zoom,historyChoice.releaseNum,{signal:controller.signal})
      .then(value=>{if(!controller.signal.aborted)setHistoryMetadata(value);})
      .catch(()=>{if(!controller.signal.aborted)setHistoryMetadata(null);});
    return()=>controller.abort();
  },[historyChoice,historyPoint]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready||!historyChoice)return;
    const update=()=>{const center=m.getCenter();setHistoryPoint({longitude:center.lng,latitude:center.lat,zoom:Math.max(10,Math.min(19,Math.round(m.getZoom())))});setHistoryMetadata(null);};
    m.on("moveend",update);
    return()=>{m.off("moveend",update);};
  },[ready,historyChoice]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    for(const key of [...rasterKinds,"contours","dtm","dsm"]){const id=`result-${key}`;if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible[key]?"visible":"none");}
    for(const id of ["project-boundary-shadow","project-boundary-line"])if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible.project?"visible":"none");
    for(const id of ["saved-flight-route-halo","saved-flight-route-line"])if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible.flightRoute?"visible":"none");
    if(m.getLayer("result-orthophoto"))m.setPaintProperty("result-orthophoto","raster-opacity",dragMode?0.5:Math.min(comparePercent/100,visible.contours&&contoursState==="ready"?0.58:1));
  },[visible,ready,contoursState,comparePercent,dragMode]);

  function toggleLayer(key:string){
    setElevationError("");
    if(key==="project"||key==="contours"){setVisible(v=>({...v,[key]:!v[key]}));return;}
    setVisible(v=>({...v,orthophoto:false,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false,[key]:!v[key]}));
    if(key!=="dtm"&&key!=="dsm")return;
    if((key==="dtm"&&dtmPreview)||(key==="dsm"&&dsmPreview)||elevationBusy===key)return;
    const item=key==="dtm"?dtm:dsm;
    if(!item){setElevationError(`Arquivo ${key.toUpperCase()} indisponível.`);return;}
    setElevationBusy(key);
    freshProcessingUrl(item,"download").then(url=>renderGeoTiffToDataUrl(url,key)).then(v=>{
      if(key==="dtm"){setDtmPreview(v.url);setDtmRange({min:v.min,max:v.max});setDtmCorners(v.corners);}
      else{setDsmPreview(v.url);setDsmRange({min:v.min,max:v.max});setDsmCorners(v.corners);}
    }).catch(e=>setElevationError(e instanceof Error?e.message:`Não foi possível abrir ${key.toUpperCase()}.`))
      .finally(()=>setElevationBusy(v=>v===key?null:v));
  }

  function compare(value:number){
    setBasemap("satellite");setComparePercent(value);
    setVisible(v=>({...v,orthophoto:true,contours:false,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false}));
  }
  async function findHistoricalImages(){
    const m=map.current;if(!m)return;
    const center=m.getCenter(),zoom=Math.max(10,Math.min(19,Math.round(m.getZoom())));
    setHistoryBusy(true);setHistoryError("");setHistoryItems([]);setHistoryOpen(true);
    try{
      const items=await getWaybackItems();
      const valid=items.filter(item=>{try{waybackTileUrl(item);return true;}catch{return false;}});
      setHistoryItems(valid);setHistoryPoint({longitude:center.lng,latitude:center.lat,zoom});
      if(!valid.length)setHistoryError("Nenhuma versão histórica está disponível no momento.");
    }catch{setHistoryError("Não foi possível consultar o arquivo histórico. Tente novamente.");}
    finally{setHistoryBusy(false);}
  }
  function startReferencePlacement(){
    setAligningId(null);setDragMode(false);setPlacingReference(true);setShowReferences(true);setReferenceMessage("");compare(0);
  }
  async function removeReference(id:string){
    setReferenceBusy(true);setReferenceMessage("");
    try{
      const points=await changeResultReference(surveyId??"",{kind:"remove",id});
      onReferencePointsChange?.(points);setAlignment(current=>current.filter(pair=>pair.id!==id));
      if(aligningId===id)setAligningId(null);
      setReferenceMessage("Cruz removida do levantamento.");
    }catch(error){setReferenceMessage(error instanceof Error?error.message:"Não foi possível remover a cruz.");}
    finally{setReferenceBusy(false);}
  }

  function startVisualDrag(){
    setAligningId(null);setDraftOffset(savedOffset);setDragFeedback("");setShowReferences(true);setDragMode(true);
    compare(50);
  }
  function saveVisualDrag(){
    try{
      const offset=draftOffsetRef.current;
      localStorage.setItem(alignmentKey,JSON.stringify({pairs:alignment,offset}));
      setSavedOffset(offset);setDragMode(false);
      setDragFeedback("Posição visual salva neste navegador para este processamento.");
    }catch{setDragFeedback("Não foi possível salvar neste navegador. O ajuste continua aberto para tentar novamente.");}
  }
  function cancelVisualDrag(){setDraftOffset(savedOffset);setDragMode(false);setDragFeedback("Ajuste não salvo descartado.");}
  function clearVisualAlignment(){
    setAligningId(null);setDragMode(false);setAlignment([]);setSavedOffset([0,0]);setDraftOffset([0,0]);
    setDragFeedback("Ajuste visual removido.");
  }

  function measureAreaOnOrthophoto(){
    setVisible(v=>({...v,orthophoto:true,hillshade:false,hypsometry:false,slope:false,dtm:false,dsm:false}));
    setComparePercent(100);
    setAreaImageSource("orthophoto");
    setStartAreaRevision(v=>v+1);
    requestAnimationFrame(()=>el.current?.scrollIntoView({behavior:"smooth",block:"center"}));
  }

  if(!bounds)return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Os resultados existem, mas ainda não há limites geográficos suficientes para abrir o mapa.</div>;

  const controls=privateMode?[["orthophoto","Ortofoto recortada"],["project","Plano de voo"]] as const:[["orthophoto","Ortofoto"],["project","Plano de voo"],["contours","Curvas 0,50 m"],["hillshade","Relevo sombreado"],["hypsometry","Hipsometria"],["slope","Declividade"],["dtm","DTM"],["dsm","DSM"]] as const;
  const projectArea=coverage?.areaM2??null,projectPerimeter=coverage?.perimeterM??null;

  return <div>
    {orthophoto&&!privateMode&&<section aria-label="Alinhar prévia visualmente" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <h3 className="font-semibold">⊕ Alinhamento visual da prévia</h3>
      <p className="mt-1 text-xs leading-5">Marque na ortofoto o mesmo detalhe de cada cruz do mapa do levantamento.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" aria-pressed={placingReference} onClick={placingReference?()=>setPlacingReference(false):startReferencePlacement} disabled={clipEditing||measurementActive||referenceBusy||referencePoints.length>=6||!surveyId} className="rounded-lg border border-amber-600 bg-white px-3 py-2 font-semibold disabled:opacity-50">{placingReference?"Cancelar nova cruz":"Nova cruz no satélite"}</button>
        {referencePoints.length>0&&<button type="button" onClick={()=>setShowReferences(value=>!value)} disabled={dragMode} className="rounded-lg border border-amber-600 bg-white px-3 py-2 font-semibold disabled:opacity-50">{showReferences?"Ocultar cruzes":"Mostrar cruzes"}</button>}
        <button type="button" onClick={clearVisualAlignment} disabled={!visualAdjusted&&aligningId===null} className="rounded-lg border border-amber-500 px-3 py-2 disabled:opacity-50">Limpar ajuste</button>
      </div>
      {referencePoints.length>0&&<div className="mt-2 flex flex-wrap gap-2">{referencePoints.map((ref,index)=><div key={ref.id} className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white p-1"><button type="button" aria-pressed={aligningId===ref.id} disabled={clipEditing||dragMode||placingReference||referenceBusy} onClick={()=>{setShowReferences(true);compare(75);setAligningId(ref.id);}} className="rounded px-2 py-1 font-semibold disabled:opacity-50">{aligningId===ref.id?`Clique na ortofoto para cruz ${index+1}`:`Cruz ${index+1}: marcar na ortofoto${alignment.some(pair=>pair.id===ref.id)?" ✓":""}`}</button><button type="button" aria-label={`Remover cruz ${index+1}`} onClick={()=>void removeReference(ref.id)} disabled={referenceBusy||placingReference} className="rounded border border-red-300 px-2 py-1 text-red-800 disabled:opacity-50">Remover</button></div>)}</div>}
      {placingReference&&<p className="mt-2 font-semibold">Satélite visível. Clique no detalhe da estrada onde deseja colocar a cruz fina.</p>}
      {referenceMessage&&<p role="status" className="mt-2 font-semibold">{referenceMessage}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={startVisualDrag} disabled={clipEditing||measurementActive||placingReference||!orthoRendered||dragMode} className="rounded-lg bg-amber-800 px-4 py-2 font-semibold text-white disabled:opacity-50">Arrastar ortofoto</button>{dragMode&&<><button type="button" onClick={saveVisualDrag} className="rounded-lg bg-emerald-900 px-4 py-2 font-semibold text-white">Salvar ajuste visual</button><button type="button" onClick={cancelVisualDrag} className="rounded-lg border border-amber-600 bg-white px-4 py-2 font-semibold">Cancelar</button></>}</div>
      {dragMode&&<div className={`mt-2 rounded-lg border px-3 py-2 font-semibold ${alignmentStatus&&alignmentStatus.total>=2&&alignmentStatus.matched===alignmentStatus.total?"border-green-600 bg-green-100 text-green-900":"border-amber-400 bg-white"}`} role="status"><p>Satélite por baixo · ortofoto 50% transparente por cima. Arraste a imagem até a estrada coincidir.</p><p className="mt-1 text-xs">{!alignmentStatus?.total?"Marque pontos correspondentes em duas cruzes para verificar a coincidência.":alignmentStatus.total<2?"Uma cruz marcada; marque outra para verificar também a rotação.":alignmentStatus.matched===alignmentStatus.total?"Verde: as duas cruzes coincidem na tela (até 5 pixels). Confira a estrada antes de salvar.":`${alignmentStatus.matched} de ${alignmentStatus.total} cruzes coincidem. Aproximar os pontos azuis das cruzes.`}</p></div>}
      {dragFeedback&&<p role="status" className="mt-2 font-semibold">{dragFeedback}</p>}
      {alignmentView.error&&<p role="alert" className="mt-2 font-semibold">{alignmentView.error}</p>}
      {aligningId&&<p className="mt-2 font-semibold">A imagem original está visível enquanto você escolhe o ponto correspondente.</p>}
      <details className="mt-2 text-xs leading-5"><summary className="cursor-pointer font-semibold">Como funciona e limites</summary><p className="mt-1">Arrastar desloca apenas a prévia. Uma cruz desloca a prévia; duas também ajustam rotação e escala. O ajuste fica neste navegador e não altera o GeoTIFF. O satélite pode estar deslocado. Para precisão técnica, use GCP medido e reprocesse.</p></details>
      {visualAdjusted&&!dragMode&&<p className="mt-2 text-xs font-semibold">A medição acompanha a prévia alinhada; as coordenadas salvas continuam referidas à ortofoto original.</p>}
    </section>}
    {orthophoto&&!privateMode&&<div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <button type="button" onClick={()=>setHistoryOpen(value=>!value)} aria-expanded={historyOpen} className="rounded-xl border border-emerald-300 bg-white px-3 py-2 font-semibold text-emerald-950">Imagens antigas {historyChoice?`· ${historyChoice.releaseDateLabel}`:""}</button>
      {historyChoice&&<button type="button" onClick={()=>{setHistoryChoice(null);setHistoryMetadata(null);}} disabled={recordingVideo} className="rounded-xl border border-emerald-300 bg-white px-3 py-2 font-semibold text-emerald-950 disabled:opacity-50">Voltar ao satélite atual</button>}
      <span>Antes: {historyChoice?`versão histórica publicada em ${historyChoice.releaseDateLabel}`:"mapa satélite de referência"}. Depois: ortofoto deste processamento.</span>
    </div>}
    {historyOpen&&orthophoto&&!privateMode&&<div className="mb-3 rounded-xl border border-emerald-200 bg-[#f4f8ef] p-3 text-xs text-emerald-950">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={()=>void findHistoricalImages()} disabled={historyBusy||dragMode||recordingVideo} className="rounded-lg bg-emerald-900 px-3 py-2 font-semibold text-white disabled:opacity-50">{historyBusy?"Carregando datas…":"Carregar datas históricas"}</button>
        {historyItems.length>0&&<label className="flex items-center gap-2 font-semibold">Versão
          <select aria-label="Escolher imagem histórica" value={historyChoice?.releaseNum??""} disabled={recordingVideo} onChange={event=>{const item=historyItems.find(value=>value.releaseNum===Number(event.target.value))??null;setHistoryChoice(item);setHistoryMetadata(null);if(item)compare(0);}} className="max-w-full rounded-lg border border-emerald-300 bg-white px-2 py-2 text-emerald-950 disabled:opacity-50">
            <option value="">Escolha uma data</option>
            {historyItems.map(item=><option key={item.releaseNum} value={item.releaseNum}>{item.releaseDateLabel}</option>)}
          </select>
        </label>}
      </div>
      {historyError&&<p role="alert" className="mt-2 text-amber-900">{historyError}</p>}
      {historyChoice&&<p className="mt-2">{historyMetadata?.date?`Imagem no centro do mapa capturada em ${historicalDate(historyMetadata.date)}${historyMetadata.provider?` · ${historyMetadata.provider}`:""}.`:"Data de captura neste ponto indisponível."} A data da lista indica quando a versão do mapa foi publicada.</p>}
      <p className="mt-2">Cada data da lista identifica uma versão do mapa, não uma nova foto deste local. Verifique a data de captura exibida após escolher a versão; algumas versões podem mostrar a mesma imagem.</p>
    </div>}
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Camadas do mapa">
      {controls.map(([key,label])=><button key={key} type="button" disabled={recordingVideo} aria-pressed={!!visible[key]} onClick={()=>toggleLayer(key)} aria-busy={elevationBusy===key||(key==="contours"&&visible.contours&&contoursState==="loading")} className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${visible[key]?"border-emerald-800 bg-emerald-900 text-white shadow-sm":"border-emerald-200 bg-white text-emerald-950"}`}>{elevationBusy===key?"Abrindo…":label}</button>)}
    </div>
    {orthophoto&&!privateMode&&<div role="group" aria-label="Antes e depois" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
      <p className="mb-1 text-xs font-semibold text-emerald-950">Arraste para comparar</p>
      <div className="flex w-full items-center gap-2">
        <button type="button" onClick={()=>compare(0)} disabled={dragMode} aria-pressed={visible.orthophoto&&comparePercent===0} title="Mapa satélite de referência" className={`shrink-0 rounded-lg border px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${visible.orthophoto&&comparePercent===0?"border-emerald-800 bg-emerald-900 text-white shadow-sm":"border-emerald-200 bg-white text-emerald-950"}`}>Antes</button>
        <input type="range" min="0" max="100" step="1" value={comparePercent} onChange={e=>compare(Number(e.target.value))} disabled={dragMode} aria-label="Comparar mapa satélite e ortofoto" aria-valuetext={`${comparePercent}% de ortofoto`} className="h-11 min-w-0 flex-1 accent-emerald-800 disabled:opacity-50"/>
        <button type="button" onClick={()=>compare(100)} disabled={dragMode} aria-pressed={visible.orthophoto&&comparePercent===100} title="Ortofoto processada" className={`shrink-0 rounded-lg border px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${visible.orthophoto&&comparePercent===100?"border-emerald-800 bg-emerald-900 text-white shadow-sm":"border-emerald-200 bg-white text-emerald-950"}`}>Depois</button>
      </div>
    </div>}
    {historyChoice&&orthophoto&&!privateMode&&orthoRendered&&ready&&<BeforeAfterRecorder getMapCanvas={()=>map.current?.getCanvas()??null} projectName={projectName} oldDate={historyMetadata?.date?`Imagem antiga: ${historicalDate(historyMetadata.date)}`:`Versão publicada: ${historyChoice.releaseDateLabel.split("-").reverse().join("/")}`} flightDate={flightDate?`Levantamento: ${flightDate.split("-").reverse().join("/")}`:"Levantamento: data não informada"} planAvailable={flightLegs.length>0} planShown={visible.flightRoute} onPlanShownChange={value=>setVisible(v=>({...v,flightRoute:value}))} onRecordingChange={setRecordingVideo}/>}
    {orthophoto&&!privateMode&&<div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"><p>Arraste a barra “Antes/Depois” para comparar a imagem escolhida com a ortofoto.</p><button type="button" onClick={measureAreaOnOrthophoto} disabled={clipEditing||!!aligningId||placingReference||dragMode} className="rounded-xl bg-emerald-900 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Medir área na ortofoto</button></div>}

    <div className="relative overflow-hidden rounded-[22px] border border-emerald-200 bg-slate-100 shadow-[0_10px_30px_rgba(22,63,45,.10)]">
      <div ref={el} className="orion-results-map h-[58vh] min-h-[440px] max-h-[720px] w-full" aria-label="Mapa dos resultados do processamento" data-ortho-preview={privateMode?"server-protected-png-v2":"webp-v1"} data-ortho-state={orthoError?"error":orthoRendered?"ready":"loading"} data-active-raster={[...rasterKinds,"dtm","dsm"].find(k=>visible[k])||"none"} data-layer-state={elevationBusy?"loading":elevationError?"error":"ready"} data-contour-state={contoursState} data-contour-count={contoursCount}/>
      {dragMode&&<div className={`pointer-events-none absolute bottom-11 left-3 z-10 rounded-lg border px-3 py-2 text-xs font-bold shadow ${alignmentStatus&&alignmentStatus.total>=2&&alignmentStatus.matched===alignmentStatus.total?"border-green-700 bg-green-100 text-green-950":"border-amber-500 bg-white/95 text-amber-950"}`}>{alignmentStatus&&alignmentStatus.total>=2&&alignmentStatus.matched===alignmentStatus.total?"✓ Cruzes coincidem na tela":"Satélite embaixo · ortofoto 50% por cima"}</div>}
      {visible.orthophoto&&(orthoBusy||(!orthoRendered&&!!transparentOrtho))&&!orthoError&&<div role="status" className="absolute left-16 right-16 top-3 z-10 rounded-xl bg-white/95 p-3 text-center text-xs text-emerald-950 shadow">
        <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent"/>
        {orthoProgress?.phase==="download"?`Recebendo prévia: ${Math.round(orthoProgress.loaded/1024)} KB${orthoProgress.total?" / "+Math.round(orthoProgress.total/1024)+" KB":""}`:orthoProgress?.phase==="prepare"?"Preparando imagem no mapa…":orthoProgress?.phase==="ready"?"Exibindo ortofoto…":"Carregando prévia leve da ortofoto…"}
      </div>}
      {orthoError&&visible.orthophoto&&<div role="alert" className="absolute left-16 right-16 top-3 z-10 rounded-xl bg-amber-50/95 p-3 text-xs text-amber-950 shadow"><p>{orthoError}</p><button type="button" onClick={()=>setOrthoRetry(v=>v+1)} className="mt-2 rounded-lg border border-amber-700 px-3 py-1 font-semibold">Tentar novamente</button></div>}
      {elevationBusy&&<div role="status" className="absolute left-16 right-16 top-3 z-10 rounded-xl bg-white/95 px-3 py-2 text-center text-xs font-medium text-emerald-950 shadow">Preparando {elevationBusy==="slope"?"declividade":elevationBusy.toUpperCase()}…</div>}
      {visible.contours&&contoursState!=="ready"&&<div role={contoursState==="error"?"alert":"status"} className="absolute bottom-10 left-3 right-3 z-10 rounded-xl bg-white/95 px-3 py-2 text-xs text-amber-950 shadow">{contoursState==="error"?contoursError:"Carregando linhas de nível…"}</div>}
      {visible.slope&&processedSlope&&!mapTool&&<div style={{pointerEvents:"none"}} aria-label="Legenda de declividade" className="absolute bottom-10 right-3 z-10 max-w-[230px] rounded-xl border border-white bg-white/95 p-3 text-[10px] text-slate-800 shadow-md">
        <strong className="text-xs">Declividade (%)</strong><div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">{SLOPE_CLASSES.map(c=><span key={c.label} className="flex items-center gap-1"><i className="h-2.5 w-3 rounded-sm" style={{background:c.color}}/>{c.label}</span>)}</div>
        <p className="mt-2">Prévia calculada do DTM na grade original. Sem dados: transparente.</p>
      </div>}
      {!mapTool&&((visible.dtm&&dtmRange)||(visible.dsm&&dsmRange))&&(()=>{const r=visible.dtm?dtmRange!:dsmRange!;return <div style={{pointerEvents:"none"}} aria-label="Legenda de elevação" className="absolute bottom-10 right-3 z-10 w-48 rounded-xl border border-white bg-white/95 p-3 text-[10px] text-slate-800 shadow-md"><strong className="text-xs">{visible.dtm?"DTM · terreno":"DSM · superfície"} (m)</strong><div className="mb-1 mt-2 h-2 rounded-full" style={{background:visible.dtm?"linear-gradient(90deg,#225e39,#689e4c,#c2c256,#dc9548,#845037)":"linear-gradient(90deg,#2c5fa0,#3a97b0,#5ba878,#d7be52,#b65240)"}}/><div className="flex justify-between"><span>{r.min.toLocaleString("pt-BR",{maximumFractionDigits:2})} m</span><span>{r.max.toLocaleString("pt-BR",{maximumFractionDigits:2})} m</span></div><p className="mt-1">Escala dos pixels válidos. Sem dados: transparente.</p></div>;})()}
      <div className="absolute right-3 top-3 z-10">
        <button type="button" aria-expanded={layersOpen} onClick={()=>setLayersOpen(v=>!v)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/80 bg-white/95 text-xl shadow-md backdrop-blur" title="Camadas">▱</button>
        {layersOpen&&<div className="mt-2 w-56 rounded-2xl border border-slate-200 bg-white/95 p-3 text-sm shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <strong className="text-xs text-slate-700">Camadas</strong>
            <button type="button" onClick={()=>setLayersOpen(false)} className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600" aria-label="Fechar camadas">×</button>
          </div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Mapa base</p>
          {basemap==="streets"&&<p className="mb-2 text-[11px] leading-4 text-slate-600">As ruas do OSM são linhas cartográficas e podem diferir da posição e largura vistas na ortofoto. Satélite oferece uma junção visual mais natural. A georreferência não é ajustada aqui.</p>}
          <div className="grid gap-1">
            {(Object.keys(baseMaps) as BaseMap[]).map(key=><button key={key} type="button" onClick={()=>{setBasemap(key);setLayersOpen(false);}} className={`rounded-xl px-3 py-2 text-left text-xs font-semibold ${basemap===key?"bg-emerald-900 text-white":"bg-slate-50 text-slate-700"}`}>{(baseMaps[key]??esriImagery).label}</button>)}
          </div>
          <p className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Sobreposições</p>
          <label className="flex items-center justify-between gap-3 py-1.5"><span>Ortofoto</span><input type="checkbox" checked={!!visible.orthophoto} onChange={()=>toggleLayer("orthophoto")}/></label>
          <label className="flex items-center justify-between gap-3 py-1.5"><span>Plano de voo</span><input type="checkbox" checked={!!visible.project} onChange={()=>setVisible(v=>({...v,project:!v.project}))}/></label>
          {!privateMode&&<label className="flex items-center justify-between gap-3 py-1.5"><span>Curvas</span><input type="checkbox" checked={!!visible.contours} onChange={()=>setVisible(v=>({...v,contours:!v.contours}))}/></label>}
        </div>}
      </div>
    </div>

      <SlopeInspector embedded mapTool={mapTool} toolbarCommand={terrainCommand} onToolbarFeedback={setTerrainFeedback} key={dtm?.id||"no-dtm"} map={ready&&!visualAdjusted?measurementMap:null} source={dtm||null} slopeVisible={!!visible.slope} selection={measureSelection} measuring={measurementActive||clipEditing||!!aligningId||placingReference||dragMode} onDrawArea={()=>{setAreaImageSource(null);setStartAreaRevision(v=>v+1);requestAnimationFrame(()=>el.current?.scrollIntoView({behavior:"smooth",block:"center"}));}} onDrawProfile={()=>{setStartPathRevision(v=>v+1);requestAnimationFrame(()=>el.current?.scrollIntoView({behavior:"smooth",block:"center"}));}}/>
      <MapMeasurement floating reportSourcesEnabled terrainAvailable={!!dtm&&!visualAdjusted} terrainFeedback={terrainFeedback} onTerrainAction={onTerrainAction} onToolChange={setMapTool} map={ready?measurementMap:null} disabled={clipEditing||!!aligningId||placingReference||dragMode} displayTransform={measurementTransform} surveyId={results[0]?.survey_id||null} onActiveChange={setMeasurementActive} onDrawingChange={onMeasurementChange} startAreaRevision={startAreaRevision} startAreaImageSource={areaImageSource} startPathRevision={startPathRevision}/>

    {visible.project&&(projectArea!==null||projectPerimeter!==null)&&<p className="mt-3 rounded-xl border border-emerald-100 bg-[#f4f8ef] px-3 py-2 text-xs text-slate-700">{planCoverage?"Plano de voo":"Cobertura estimada"} · Área {projectArea!==null?(projectArea/10000).toLocaleString("pt-BR",{maximumFractionDigits:2})+" ha":"—"} · Perímetro {projectPerimeter!==null?projectPerimeter.toLocaleString("pt-BR",{maximumFractionDigits:0})+" m":"—"}</p>}

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
  </div>;
}

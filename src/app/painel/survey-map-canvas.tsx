"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapMeasurement from "@/components/measurement/map-measurement";
import GoogleMapsImport from "@/components/google-maps-import";
import type {ImportedMapLocation} from "@/lib/google-maps-location";
import InfoPopover from "@/components/info-popover";
import {measureDrawing,type MeasureDrawing} from "@/lib/map-measurement";
import type {SurveyPlanning,SurveyBasemap} from "@/lib/survey-planning";
import {streetBasemap,esriImagery,topoBasemap} from "@/lib/basemaps";
import "./survey-map.css";
const layers={satellite:esriImagery,streets:streetBasemap,topo:topoBasemap};
const layerFor=(key:SurveyBasemap)=>layers[key];
export type CityPlace={lat:number;lon:number;label:string;query:string;zoom?:number;source?:"google-maps";restore?:boolean};
type Props={onImport:(point:ImportedMapLocation)=>void;value:SurveyPlanning;onChange:(v:SurveyPlanning)=>void;place:CityPlace|null;city:string;status:string;error:string};
export default function SurveyMapCanvas(props:Props){
 const element=useRef<HTMLDivElement>(null),map=useRef<maplibre.Map|null>(null),latest=useRef(props),wrapper=useRef<HTMLElement>(null);
 const [readyMap,setReadyMap]=useState<maplibre.Map|null>(null),[error,setError]=useState(""),[areaCommand,setAreaCommand]=useState(0),[expanded,setExpanded]=useState(false);
 useEffect(()=>{latest.current=props;});
 const emit=useCallback((patch:Partial<SurveyPlanning>)=>{const next={...latest.current.value,...patch};latest.current={...latest.current,value:next};latest.current.onChange(next);},[]);
 const onDrawing=useCallback((drawing:MeasureDrawing)=>{if(JSON.stringify(drawing)!==JSON.stringify(latest.current.value.drawing))emit({drawing});},[emit]);
 const metrics=useMemo(()=>{try{return measureDrawing(props.value.drawing);}catch{return null;}},[props.value.drawing]);
 useEffect(()=>{
  if(!element.current)return;let m:maplibre.Map|undefined,observer:ResizeObserver|undefined;
  try{
   const initial=latest.current.value,base=layerFor(initial.basemap);maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
   m=new maplibre.Map({container:element.current,center:initial.center||[-52,-14],zoom:initial.center?initial.zoom:4,renderWorldCopies:false,dragRotate:false,pitchWithRotate:false,attributionControl:false,style:{version:8,sources:{base:{type:"raster",tiles:[base.url],tileSize:256,maxzoom:base.maxzoom,attribution:base.attribution}},layers:[{id:"background",type:"background",paint:{"background-color":"#e4ebe1"}},{id:"base",type:"raster",source:"base"}]}});
   const current=m;map.current=m;
   m.addControl(new maplibre.NavigationControl({showCompass:false}),"top-right");m.addControl(new maplibre.ScaleControl({unit:"metric"}),"bottom-left");m.addControl(new maplibre.AttributionControl({compact:true}),"bottom-right");
   m.on("load",()=>{if(map.current===current)setReadyMap(current);});
   m.on("moveend",()=>{if(map.current!==current)return;const center=current.getCenter();emit({center:[center.lng,center.lat],zoom:current.getZoom()});if(element.current){element.current.dataset.center=JSON.stringify([center.lng,center.lat]);element.current.dataset.zoom=String(current.getZoom());}});
   m.on("error",e=>{if("sourceId" in e&&e.sourceId==="base")setError("A camada não carregou. Troque a camada ou tente novamente; seus pontos foram preservados.");});
   observer=new ResizeObserver(()=>current.resize());observer.observe(element.current);
  }catch{
   // eslint-disable-next-line react-hooks/set-state-in-effect -- Surface failure from the external WebGL renderer.
   setError("Não foi possível iniciar o mapa. Ative a aceleração gráfica ou tente outro navegador.");
  }
  return()=>{observer?.disconnect();m?.remove();map.current=null;};
 },[emit]);
 useEffect(()=>{
  if(!readyMap)return;const base=layerFor(props.value.basemap);
  if(readyMap.getLayer("base"))readyMap.removeLayer("base");if(readyMap.getSource("base"))readyMap.removeSource("base");
  readyMap.addSource("base",{type:"raster",tiles:[base.url],tileSize:256,maxzoom:base.maxzoom,attribution:base.attribution});
  const before=readyMap.getStyle().layers?.find(layer=>layer.id!=="background")?.id;readyMap.addLayer({id:"base",type:"raster",source:"base"},before);
 },[readyMap,props.value.basemap]);
 useEffect(()=>{
  if(!readyMap||!props.place)return;const p=props.place;
  const marker=new maplibre.Marker({color:"#2c7658",scale:.7}).setLngLat([p.lon,p.lat]).addTo(readyMap);
  marker.getElement().setAttribute("aria-label",p.source==="google-maps"?"Localização importada do Google Maps":`Centro de ${p.query}`);marker.getElement().dataset.testid=p.source==="google-maps"?"google-imported-marker":"city-marker";marker.getElement().style.pointerEvents="none";
  emit({cityQuery:p.query});if(!p.restore)readyMap.jumpTo({center:[p.lon,p.lat],zoom:p.zoom??12});
  return()=>{marker.remove();};
 },[readyMap,props.place,emit]);
 useEffect(()=>{
  if(!expanded)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";
  const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setExpanded(false);};window.addEventListener("keydown",close);
  return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);};
 },[expanded]);
 function fit(){const points=latest.current.value.drawing.points;if(points.length&&map.current){const b=new maplibre.LngLatBounds(points[0],points[0]);points.forEach(p=>b.extend(p));map.current.fitBounds(b,{padding:55,maxZoom:19,duration:0});}else if(props.place)map.current?.jumpTo({center:[props.place.lon,props.place.lat],zoom:props.place.zoom??12});}
 const fmt=(v:number|null|undefined,suffix:string)=>v==null?"—":`${v.toLocaleString("pt-BR",{maximumFractionDigits:2})} ${suffix}`;
 return <section ref={wrapper} className={`survey-working-map${expanded?" survey-map-expanded":""}`} data-testid="survey-map-workspace">
  <header><div className="survey-map-title"><strong>Mapa do levantamento</strong><InfoPopover title="Mapa e medições do levantamento"><p>A cidade posiciona a vista, não delimita o terreno. Use Área ou Medir para desenhar sobre a imagem Esri, o mapa de ruas ou o topográfico. A imagem de satélite é uma referência, não uma ortofoto produzida pelo seu drone.</p><p>Medidas horizontais no elipsoide WGS84. Relevo, altura e precisão do levantamento não são inferidos do mapa-base. Inclinação e perfil de elevação exigem um modelo de terreno processado.</p><p>O desenho e a vista ficam vinculados ao levantamento quando você o salva. Planejar voo leva o contorno e o perfil de câmera ao planejador. Não altera as ortofotos, as fotos enviadas nem os resultados do processamento.</p></InfoPopover></div><button type="button" className="survey-map-button" onClick={()=>setExpanded(v=>!v)}>{expanded?"Fechar mapa ampliado":"Ampliar"}</button></header>
  <div className="survey-map-bar"><label>Camada<select aria-label="Camada do mapa do levantamento" value={props.value.basemap} onChange={e=>{setError("");emit({basemap:e.target.value as SurveyBasemap});}}>{Object.entries(layers).map(([key,layer])=><option key={key} value={key}>{layer.label}</option>)}</select></label><button type="button" className="survey-map-button" disabled={!readyMap} onClick={()=>setAreaCommand(v=>v+1)}>Delimitar área</button><button type="button" className="survey-map-button" disabled={!readyMap||(!props.value.drawing.points.length&&!props.place)} onClick={fit}>Enquadrar</button><span className="survey-city" title={props.place?.label||props.city}>{props.status||(props.place?.source==="google-maps"?props.place.label:props.city)}</span></div>
  <GoogleMapsImport onApply={props.onImport} disabled={!readyMap}/>
  <div className="survey-map-host"><div ref={element} className="survey-map-canvas" aria-label="Mapa de trabalho do levantamento" data-testid="survey-map" data-ready={!!readyMap} data-basemap={props.value.basemap}/></div>
  <MapMeasurement key="survey-drawing" map={readyMap} floating embedded initialDrawing={props.value.drawing} onDrawingChange={onDrawing} startAreaRevision={areaCommand}/>
  <div className="survey-map-metrics" data-testid="survey-map-metrics"><span>Área <b>{fmt(metrics?.area_m2!=null?metrics.area_m2/10000:null,"ha")}</b></span><span>{props.value.drawing.kind==="path"?"Distância":"Perímetro"} <b>{fmt(props.value.drawing.kind==="path"&&props.value.drawing.points.length>=2?metrics?.distance_m:metrics?.perimeter_m,"m")}</b></span><span>{props.value.drawing.points.length} pontos</span></div>
  {(props.error||error)&&<p role="alert" className="survey-map-error">{props.error||error}</p>}
 </section>;
}

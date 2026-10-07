"use client";
import MapMeasurement from "@/components/measurement/map-measurement";
import {isMeasuringMap} from "@/lib/measurement-map-state";

import {useEffect,useRef,useState} from "react";
import * as maplibre from "maplibre-gl";
import type {GeoJSONSource} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {XY} from "@/lib/agro-plan";
import type {AgroPreview} from "./actions";

type Props={surveyId?:string;data:GeoJSON.FeatureCollection;draft:XY[];drawing:"boundary"|"exclusion"|null;selected:string[];center:XY|null;fit:number;preview:AgroPreview|null;showOrtho:boolean;onPoint:(p:XY)=>void;onMove:(i:number,p:XY)=>void;onRow:(id:string)=>void};
const empty:GeoJSON.FeatureCollection={type:"FeatureCollection",features:[]};
export default function AgroMap(props:Props){
 const element=useRef<HTMLDivElement>(null),map=useRef<maplibre.Map|null>(null),latest=useRef(props);
 const [ready,setReady]=useState(false),[error,setError]=useState(""),[satellite,setSatellite]=useState(false);
 const [measurementMap,setMeasurementMap]=useState<maplibre.Map|null>(null);
 useEffect(()=>{latest.current=props;});
 useEffect(()=>{
  if(!element.current)return;let m:maplibre.Map|undefined;
  try{
   maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
   m=new maplibre.Map({container:element.current,center:[-52,-14],zoom:4,renderWorldCopies:false,dragRotate:false,pitchWithRotate:false,attributionControl:false,style:{version:8,sources:{base:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}},layers:[{id:"background",type:"background",paint:{"background-color":"#dce7d9"}},{id:"base",type:"raster",source:"base"}]}});
   map.current=m;const current=m;
   current.addControl(new maplibre.NavigationControl(),"top-right");current.addControl(new maplibre.ScaleControl({unit:"metric"}),"bottom-left");current.addControl(new maplibre.AttributionControl({compact:true}));
   current.on("load",()=>{
    current.addSource("agro",{type:"geojson",data:empty});current.addSource("draft",{type:"geojson",data:empty});
    current.addLayer({id:"field-fill",type:"fill",source:"agro",filter:["==",["get","kind"],"field"],paint:{"fill-color":"#178155","fill-opacity":0.09}});
    current.addLayer({id:"field-outline",type:"line",source:"agro",filter:["==",["get","kind"],"field"],paint:{"line-color":"#09563b","line-width":2}});
    current.addLayer({id:"exclusions",type:"fill",source:"agro",filter:["==",["get","kind"],"exclusion"],paint:{"fill-color":"#ce4148","fill-opacity":0.32}});
    current.addLayer({id:"exclusion-outline",type:"line",source:"agro",filter:["==",["get","kind"],"exclusion"],paint:{"line-color":"#ae2936","line-width":2}});
    current.addLayer({id:"rows",type:"line",source:"agro",filter:["==",["get","kind"],"row"],paint:{"line-color":["get","color"],"line-width":3}});
    current.addLayer({id:"selected-rows",type:"line",source:"agro",filter:["all",["==",["get","kind"],"row"],["in",["get","row_id"],["literal",[]]]],paint:{"line-color":"#fa4d0a","line-width":6}});
    current.addLayer({id:"draft-line",type:"line",source:"draft",paint:{"line-color":"#e96720","line-width":3,"line-dasharray":[2,2]}});
    setMeasurementMap(current);setReady(true);
   });
   current.on("click",e=>{
    if(isMeasuringMap(current))return;const p=latest.current;if(p.drawing){p.onPoint([e.lngLat.lng,e.lngLat.lat]);return;}
    if(!current.getLayer("rows"))return;
    const hits=current.queryRenderedFeatures([[e.point.x-8,e.point.y-8],[e.point.x+8,e.point.y+8]],{layers:["rows"]});
    const id=hits[0]?.properties?.row_id;if(typeof id==="string")p.onRow(id);
   });
   current.on("error",e=>{if("sourceId" in e&&e.sourceId==="base")setError("Mapa-base indisponível. Seus desenhos continuam preservados.");if("sourceId" in e&&e.sourceId==="ortho")setError("A ortofoto não carregou. Recarregue a ortofoto pelo painel sem perder o plano.");});
  }catch{
   // External WebGL initialization can fail independently from the form.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   setError("WebGL não disponível. Os dados podem ser editados/importados e exportados pelo painel.");
  }
  const observer=new ResizeObserver(()=>map.current?.resize());observer.observe(element.current);
  return()=>{observer.disconnect();m?.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;
  (m.getSource("agro") as GeoJSONSource).setData(props.data);
  m.setFilter("selected-rows",["all",["==",["get","kind"],"row"],["in",["get","row_id"],["literal",props.selected]]]);
 },[ready,props.data,props.selected]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;
  (m.getSource("draft") as GeoJSONSource).setData({type:"FeatureCollection",features:props.draft.length>=2?[{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:props.draft}}]:[]});
  const markers=props.draft.map((point,i)=>{
   const el=document.createElement("button");el.type="button";el.className="agro-edit-vertex";el.textContent=String(i+1);el.style.cssText="border-radius:50%;width:28px;height:28px;background:white;color:#075439;border:2px solid #075439;font-size:11px";el.title=`Vértice ${i+1}: arraste para ajustar`;
   el.addEventListener("click",e=>e.stopPropagation());
   const marker=new maplibre.Marker({element:el,draggable:true}).setLngLat(point).addTo(m);
   marker.on("dragend",()=>{const c=marker.getLngLat();latest.current.onMove(i,[c.lng,c.lat]);});return marker;
  });
  m.getCanvas().style.cursor=props.drawing?"crosshair":"grab";if(props.drawing)m.doubleClickZoom.disable();else m.doubleClickZoom.enable();
  return()=>markers.forEach(marker=>marker.remove());
 },[ready,props.draft,props.drawing]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;m.removeLayer("base");m.removeSource("base");
  m.addSource("base",{type:"raster",tiles:[satellite?"https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false":"https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,maxzoom:satellite?17:19,attribution:satellite?'Imagery © Esri, Vantor, Earthstar Geographics':'© OpenStreetMap contributors'});
  m.addLayer({id:"base",type:"raster",source:"base"},m.getLayer("ortho")?"ortho":"field-fill");
 },[ready,satellite]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;
  if(m.getLayer("ortho"))m.removeLayer("ortho");if(m.getSource("ortho"))m.removeSource("ortho");
  if(props.preview&&props.showOrtho){const {url,bounds:b}=props.preview;m.addSource("ortho",{type:"image",url,coordinates:[[b.west,b.north],[b.east,b.north],[b.east,b.south],[b.west,b.south]]});m.addLayer({id:"ortho",type:"raster",source:"ortho",paint:{"raster-opacity":0.9,"raster-fade-duration":0}},"field-fill");}
 },[ready,props.preview,props.showOrtho]);
 useEffect(()=>{if(ready&&props.center)map.current?.flyTo({center:props.center,zoom:17});},[ready,props.center]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready||!props.fit)return;
  const data=latest.current,field=data.data.features.find(f=>f.properties?.kind==="field");
  if(field?.geometry.type==="Polygon"){const pts=field.geometry.coordinates[0] as XY[];if(pts.length){const b=new maplibre.LngLatBounds(pts[0],pts[0]);pts.forEach(p=>b.extend(p));m.fitBounds(b,{padding:55,maxZoom:19,duration:500});}}
  else if(data.preview){const b=data.preview.bounds;m.fitBounds([[b.west,b.south],[b.east,b.north]],{padding:30,maxZoom:19});}
 },[ready,props.fit]);
 return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-xs"><span>{props.drawing?"Toque nos vértices e conclua o contorno.":"Toque em uma linha para selecioná-la."}</span><label className="flex items-center gap-2">Fundo<select aria-label="Fundo do mapa agro" value={satellite?"satellite":"map"} onChange={e=>{setError("");setSatellite(e.target.value==="satellite");}} className="rounded-lg border p-2"><option value="map">Mapa</option><option value="satellite">Satélite</option></select></label></div>
  <div ref={element} data-testid="agro-map" data-ready={ready?"true":"false"} className="h-[450px] w-full sm:h-[620px]" aria-label="Mapa de talhões e linhas de plantio"/>
  <MapMeasurement map={ready?measurementMap:null} surveyId={props.surveyId||null} disabled={!!props.drawing}/>
  {error&&<p role="alert" className="p-3 text-xs text-amber-900">{error}</p>}
  <p className="border-t border-slate-100 p-3 text-xs text-slate-600">Limite verde · exclusões vermelhas · seleção laranja · linhas coloridas por cultura. As linhas não possuem conexões automáticas através das exclusões.</p>
 </div>;
}

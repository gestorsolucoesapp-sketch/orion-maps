"use client";
import type {ImportedMapLocation} from "@/lib/google-maps-location";
import MapMeasurement from "@/components/measurement/map-measurement";
import {isMeasuringMap} from "@/lib/measurement-map-state";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Coordinate } from "@/lib/flight-plan";
import type {ReactNode} from "react";
import { accuracyRing } from "@/lib/location-circle";
import {streetBasemap,esriImagery,topoBasemap,reliefBasemap} from "@/lib/basemaps";
const basemaps={
 satellite:esriImagery,streets:streetBasemap,topo:topoBasemap,relief:reliefBasemap
};
export type Basemap=keyof typeof basemaps;
type Props={importedLocation?:ImportedMapLocation|null;adjustingPosition?:boolean;onPositionPick?:(p:Coordinate)=>void;markingTakeoff?:boolean;takeoffPoint?:Coordinate|null;onTakeoffPick?:(p:Coordinate)=>void;userPosition:{point:Coordinate;accuracy:number;source?:"manual"}|null;points:Coordinate[];exclusions?:Coordinate[][];exclusionDraft?:Coordinate[];drawingExclusion?:boolean;onExclusionAdd?:(p:Coordinate)=>void;legs:Coordinate[][];polygon:boolean;drawing:boolean;center:Coordinate|null;fit:number;onAdd:(p:Coordinate)=>void;onMove:(i:number,p:Coordinate)=>void;basemap:Basemap;tools?:ReactNode;measureAreaRevision?:number;measurePathRevision?:number;onMeasurementActiveChange?:(active:boolean)=>void};
export default function PlanningCanvas(props:Props){
 const el=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),latest=useRef(props);
 const [ready,setReady]=useState(false),[error,setError]=useState("");
 const [measurementMap,setMeasurementMap]=useState<maplibregl.Map|null>(null);
 useEffect(()=>{latest.current=props;});
 useEffect(()=>{
  if(!el.current)return;
  let m:maplibregl.Map,observer:ResizeObserver|undefined;
  let removeMiddlePan=()=>{};
  try{
   maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
   // Only visible map tiles are requested; browser caching follows the provider headers.
   m=new maplibregl.Map({container:el.current,center:[-52,-14],zoom:4,dragRotate:false,pitchWithRotate:false,renderWorldCopies:false,attributionControl:false,style:{version:8,sources:{basemap:{type:"raster",tiles:[esriImagery.url],tileSize:256,maxzoom:esriImagery.maxzoom,attribution:esriImagery.attribution}},layers:[{id:"background",type:"background",paint:{"background-color":"#c9ccc3"}},{id:"basemap",type:"raster",source:"basemap"}]}});map.current=m;
   // Middle-button drag pans the map, including while point or area tools are active.
   const canvas=m.getCanvas(),container=m.getCanvasContainer();
   let lastX=0,lastY=0,dragging=false,previousCursor="";
   const stopMiddlePan=()=>{if(!dragging)return;dragging=false;canvas.style.cursor=previousCursor;};
   const startMiddlePan=(event:MouseEvent)=>{
    if(event.button!==1||(event.target as Element).closest("button,a,select,input,.maplibregl-control-container"))return;
    event.preventDefault();event.stopPropagation();
    dragging=true;lastX=event.clientX;lastY=event.clientY;previousCursor=canvas.style.cursor;canvas.style.cursor="grabbing";
   };
   const moveMiddlePan=(event:MouseEvent)=>{
    if(!dragging)return;
    if(!(event.buttons&4)){stopMiddlePan();return;}
    event.preventDefault();
    const dx=event.clientX-lastX,dy=event.clientY-lastY;
    lastX=event.clientX;lastY=event.clientY;
    if(dx||dy)m.jumpTo({center:m.unproject([canvas.clientWidth/2-dx,canvas.clientHeight/2-dy])});
   };
   const endMiddlePan=(event:MouseEvent)=>{if(event.button===1)stopMiddlePan();};
   const preventMiddleClick=(event:MouseEvent)=>{if(event.button===1&&event.target===canvas)event.preventDefault();};
   container.addEventListener("mousedown",startMiddlePan,true);
   container.addEventListener("auxclick",preventMiddleClick);
   window.addEventListener("mousemove",moveMiddlePan);
   window.addEventListener("mouseup",endMiddlePan);
   window.addEventListener("blur",stopMiddlePan);
   removeMiddlePan=()=>{container.removeEventListener("mousedown",startMiddlePan,true);container.removeEventListener("auxclick",preventMiddleClick);window.removeEventListener("mousemove",moveMiddlePan);window.removeEventListener("mouseup",endMiddlePan);window.removeEventListener("blur",stopMiddlePan);};
   observer=new ResizeObserver(()=>m.resize());observer.observe(el.current);
   m.addControl(new maplibregl.AttributionControl({compact:false}),"bottom-right");
   m.on("error",e=>{if("sourceId" in e&&e.sourceId==="basemap")setError("Uma imagem do mapa de fundo falhou. Se houver áreas vazias, tente outra camada; seus pontos continuam no editor.");});
   m.on("sourcedata",e=>{if(e.sourceId==="basemap"&&e.sourceDataType==="content")setError("");});
   m.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");m.addControl(new maplibregl.ScaleControl({unit:"metric"}),"bottom-left");
   m.on("load",()=>{
    const empty:GeoJSON.FeatureCollection={type:"FeatureCollection",features:[]};
    m.addSource("location-accuracy",{type:"geojson",data:empty});
    m.addLayer({id:"location-accuracy-fill",type:"fill",source:"location-accuracy",paint:{"fill-color":"#1387bd","fill-opacity":0.14}});
    m.addLayer({id:"location-accuracy-line",type:"line",source:"location-accuracy",paint:{"line-color":"#1387bd","line-width":2}});
    m.addSource("boundary",{type:"geojson",data:empty});m.addSource("exclusions",{type:"geojson",data:empty});m.addSource("exclusion-draft",{type:"geojson",data:empty});m.addSource("legs",{type:"geojson",data:empty});m.addSource("connections",{type:"geojson",data:empty});
    m.addLayer({id:"area",type:"fill",source:"boundary",paint:{"fill-color":"#dd784b","fill-opacity":0.15}});
    m.addLayer({id:"outline",type:"line",source:"boundary",paint:{"line-color":"#303c42","line-width":2,"line-dasharray":[3,2]}});
    m.addLayer({id:"excluded-fill",type:"fill",source:"exclusions",paint:{"fill-color":"#b42635","fill-opacity":0.4}});
    m.addLayer({id:"excluded-line",type:"line",source:"exclusions",paint:{"line-color":"#ad142b","line-width":3}});
    m.addLayer({id:"exclusion-draft-line",type:"line",source:"exclusion-draft",paint:{"line-color":"#ad142b","line-width":3,"line-dasharray":[2,2]}});
    m.addLayer({id:"connections-line",type:"line",source:"connections",paint:{"line-color":"#117f9a","line-width":3,"line-dasharray":[2,2]}});
    m.addLayer({id:"route",type:"line",source:"legs",paint:{"line-color":"#ba5429","line-width":3}});setMeasurementMap(m);setReady(true);
   });
   m.on("click",e=>{if(e.originalEvent.button!==0||isMeasuringMap(m)||(e.originalEvent.target as Element)?.closest(".flight-marker,.exclusion-marker,.takeoff-marker,.user-location-marker"))return;if(latest.current.markingTakeoff){latest.current.onTakeoffPick?.([e.lngLat.lng,e.lngLat.lat]);return;}if(latest.current.adjustingPosition){latest.current.onPositionPick?.([e.lngLat.lng,e.lngLat.lat]);return;}if(latest.current.drawingExclusion){latest.current.onExclusionAdd?.([e.lngLat.lng,e.lngLat.lat]);return;}if(latest.current.drawing)latest.current.onAdd([e.lngLat.lng,e.lngLat.lat]);});
  }catch{
   // A failed external WebGL initialization must surface in the UI once.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   setError("O editor exige aceleração gráfica. Ative-a no navegador e recarregue.");
  }
  return()=>{removeMiddlePan();observer?.disconnect();m?.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;
  const selected=basemaps[props.basemap]??esriImagery;
  // Replace only the background: mission geometry, location and camera stay intact.
  m.removeLayer("basemap");m.removeSource("basemap");
  m.addSource("basemap",{type:"raster",tiles:[selected.url],tileSize:256,maxzoom:selected.maxzoom,attribution:selected.attribution});
  m.addLayer({id:"basemap",type:"raster",source:"basemap"},"location-accuracy-fill");
 },[ready,props.basemap]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;
  (m.getSource("boundary") as GeoJSONSource).setData({type:"FeatureCollection",features:props.polygon&&props.points.length>=3?[{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[[...props.points,props.points[0]]]}}]:[]});
  (m.getSource("exclusions") as GeoJSONSource).setData({type:"FeatureCollection",features:(props.exclusions??[]).map((ring,i)=>({type:"Feature",properties:{index:i+1},geometry:{type:"Polygon",coordinates:[[...ring,ring[0]]]}}))});
  (m.getSource("exclusion-draft") as GeoJSONSource).setData({type:"FeatureCollection",features:props.exclusionDraft&&props.exclusionDraft.length>=2?[{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:props.exclusionDraft}}]:[]});
  const surveyLegs=props.polygon?props.legs.filter(leg=>leg.length===2):props.legs;
  const connections=props.polygon?[
   ...props.legs.filter(leg=>leg.length>2),
   ...props.legs.slice(1).map((leg,i):Coordinate[]=>[props.legs[i].at(-1)!,leg[0]]).filter(([a,b])=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])>1e-10)
  ]:[];
  (m.getSource("legs") as GeoJSONSource).setData({type:"Feature",properties:{},geometry:{type:"MultiLineString",coordinates:surveyLegs}});
  (m.getSource("connections") as GeoJSONSource).setData({type:"Feature",properties:{},geometry:{type:"MultiLineString",coordinates:connections}});
  const markers=props.points.map((p,i)=>{const element=document.createElement("div");element.className="flight-marker";element.textContent=String(i+1);element.title=`Ponto ${i+1}: arraste para ajustar`;const marker=new maplibregl.Marker({element,draggable:!props.adjustingPosition&&!props.markingTakeoff}).setLngLat(p).addTo(m);marker.on("dragend",()=>{const p=marker.getLngLat();latest.current.onMove(i,[p.lng,p.lat]);});return marker;});
  const draftMarkers=(props.exclusionDraft??[]).map((p,i)=>{const element=document.createElement("div");element.className="exclusion-marker";element.textContent=String(i+1);element.title=`Ponto ${i+1} da área isolada`;return new maplibregl.Marker({element}).setLngLat(p).addTo(m);});
  const arrowStep=Math.max(1,Math.ceil(surveyLegs.length/80));
  const directionMarkers=props.polygon?surveyLegs.flatMap((leg,i)=>{
   if(i%arrowStep)return [];
   const [a,b]=leg,midpoint:Coordinate=[(a[0]+b[0])/2,(a[1]+b[1])/2],angle=Math.atan2((b[0]-a[0])*Math.cos(midpoint[1]*Math.PI/180),b[1]-a[1])*180/Math.PI;
   const element=document.createElement("div"),arrow=document.createElement("span");element.className="flight-direction-marker";element.title=`Faixa ${i+1}: sentido do voo`;element.setAttribute("role","img");element.setAttribute("aria-label",element.title);arrow.textContent="↑";arrow.style.transform=`rotate(${angle}deg)`;element.append(arrow);
   return [new maplibregl.Marker({element,anchor:"center"}).setLngLat(midpoint).addTo(m)];
  }):[];
  m.getCanvas().style.cursor=(props.drawing||props.drawingExclusion||props.adjustingPosition||props.markingTakeoff)?"crosshair":"grab";return()=>[...markers,...draftMarkers,...directionMarkers].forEach(m=>m.remove());
 },[ready,props.points,props.exclusions,props.exclusionDraft,props.legs,props.polygon,props.drawing,props.drawingExclusion,props.adjustingPosition,props.markingTakeoff]);
 useEffect(()=>{
  const m=map.current,p=props.takeoffPoint;if(!m||!ready||!p)return;
  const element=document.createElement("div");element.className="takeoff-marker";element.textContent="H";element.title="Ponto de decolagem escolhido";element.setAttribute("role","img");element.setAttribute("aria-label","Ponto de decolagem");
  const marker=new maplibregl.Marker({element}).setLngLat(p).addTo(m);
  return()=>{marker.remove();};
 },[ready,props.takeoffPoint]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready||!props.userPosition)return;
  const {point,accuracy,source}=props.userPosition,manual=source==="manual",ring=manual?[]:accuracyRing(point,accuracy);
  const locationLabel=manual?"Posição informada por você":"Localização aproximada";
  (m.getSource("location-accuracy") as GeoJSONSource).setData({type:"FeatureCollection",features:ring.length?[{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[ring]}}]:[]});
  const element=document.createElement("div");element.className=`user-location-marker${manual?" manual-position":""}`;element.setAttribute("role","img");element.setAttribute("aria-label",locationLabel);
  const dot=document.createElement("span"),label=document.createElement("span");dot.className="user-location-dot";label.className="user-location-label";label.textContent=locationLabel;element.append(dot,label);
  const marker=new maplibregl.Marker({element}).setLngLat(point).addTo(m);
  return()=>{marker.remove();};
 },[ready,props.userPosition]);
 useEffect(()=>{
  const m=map.current,p=props.importedLocation;if(!m||!ready||!p)return;
  const marker=new maplibregl.Marker({color:"#176953"}).setLngLat([p.lon,p.lat]).addTo(m);
  marker.getElement().setAttribute("aria-label",p.kind==="view"?"Centro importado do Google Maps":"Ponto importado do Google Maps");marker.getElement().dataset.testid="planning-imported-marker";marker.getElement().style.pointerEvents="none";
  return()=>{marker.remove();};
 },[ready,props.importedLocation]);
 useEffect(()=>{if(ready&&props.center)map.current?.flyTo({center:props.center,zoom:17});},[ready,props.center]);
 useEffect(()=>{if(!ready||!props.fit||!latest.current.points.length)return;const points=latest.current.points,bounds=new maplibregl.LngLatBounds(points[0],points[0]);points.forEach(p=>bounds.extend(p));map.current?.fitBounds(bounds,{padding:60,maxZoom:19});},[ready,props.fit]);
 return <div className="mission-map-wrap"><div ref={el} data-testid="planning-map" data-ready={ready} data-imported-lat={props.importedLocation?.lat} data-imported-lon={props.importedLocation?.lon} className="mission-map" aria-label="Mapa de planejamento de waypoints"/>{error&&<p role="alert" className="map-error">{error}</p>}{props.tools}<div className="map-key"><span>● Pontos editáveis</span><span>H Decolagem</span><span>━ Faixas</span><span>↑ Sentido do voo</span><span>┄ Ligação</span><span>Rodinha pressionada: mover mapa</span></div><MapMeasurement map={ready?measurementMap:null} railMode startAreaRevision={props.measureAreaRevision} startPathRevision={props.measurePathRevision} onActiveChange={props.onMeasurementActiveChange}/></div>;
}

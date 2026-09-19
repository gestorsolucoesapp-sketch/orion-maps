"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Coordinate } from "@/lib/flight-plan";
type Props={points:Coordinate[];legs:Coordinate[][];polygon:boolean;drawing:boolean;center:Coordinate|null;fit:number;onAdd:(p:Coordinate)=>void;onMove:(i:number,p:Coordinate)=>void};
export default function PlanningCanvas(props:Props){
 const el=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),latest=useRef(props);
 const [ready,setReady]=useState(false),[error,setError]=useState("");
 useEffect(()=>{latest.current=props;});
 useEffect(()=>{
  if(!el.current)return;
  let m:maplibregl.Map;
  try{
   maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
   // Local geometry only. No tiles, remote styles, fonts or external map requests.
   m=new maplibregl.Map({container:el.current,center:[0,0],zoom:17,dragRotate:false,pitchWithRotate:false,renderWorldCopies:false,style:{version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#c9ccc3"}}]}});map.current=m;
   m.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-left");m.addControl(new maplibregl.ScaleControl({unit:"metric"}),"bottom-left");
   m.on("load",()=>{
    const empty:GeoJSON.FeatureCollection={type:"FeatureCollection",features:[]};
    m.addSource("boundary",{type:"geojson",data:empty});m.addSource("legs",{type:"geojson",data:empty});
    m.addLayer({id:"area",type:"fill",source:"boundary",paint:{"fill-color":"#dd784b","fill-opacity":0.15}});
    m.addLayer({id:"outline",type:"line",source:"boundary",paint:{"line-color":"#303c42","line-width":2,"line-dasharray":[3,2]}});
    m.addLayer({id:"route",type:"line",source:"legs",paint:{"line-color":"#ba5429","line-width":3}});setReady(true);
   });
   m.on("click",e=>{if(latest.current.drawing)latest.current.onAdd([e.lngLat.lng,e.lngLat.lat]);});
  }catch{
   // A failed external WebGL initialization must surface in the UI once.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   setError("O editor exige aceleração gráfica. Ative-a no navegador e recarregue.");
  }
  return()=>{m?.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;
  (m.getSource("boundary") as GeoJSONSource).setData({type:"FeatureCollection",features:props.polygon&&props.points.length>=3?[{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[[...props.points,props.points[0]]]}}]:[]});
  (m.getSource("legs") as GeoJSONSource).setData({type:"Feature",properties:{},geometry:{type:"MultiLineString",coordinates:props.legs}});
  const markers=props.points.map((p,i)=>{const element=document.createElement("div");element.className="flight-marker";element.textContent=String(i+1);element.title=`Ponto ${i+1}: arraste para ajustar`;const marker=new maplibregl.Marker({element,draggable:true}).setLngLat(p).addTo(m);marker.on("dragend",()=>{const p=marker.getLngLat();latest.current.onMove(i,[p.lng,p.lat]);});return marker;});
  m.getCanvas().style.cursor=props.drawing?"crosshair":"grab";return()=>markers.forEach(m=>m.remove());
 },[ready,props.points,props.legs,props.polygon,props.drawing]);
 useEffect(()=>{if(ready&&props.center)map.current?.flyTo({center:props.center,zoom:17});},[ready,props.center]);
 useEffect(()=>{if(!ready||!props.fit||!latest.current.points.length)return;const points=latest.current.points,bounds=new maplibregl.LngLatBounds(points[0],points[0]);points.forEach(p=>bounds.extend(p));map.current?.fitBounds(bounds,{padding:60,maxZoom:19});},[ready,props.fit]);
 return <div className="mission-map-wrap"><div ref={el} className="mission-map" aria-label="Editor geográfico local de waypoints"/>{error&&<p role="alert" className="map-error">{error}</p>}<div className="canvas-local-label">EDITOR LOCAL · SEM MAPA-BASE EXTERNO</div><div className="map-key"><span>● Pontos editáveis</span><span>━ Faixas de levantamento</span></div></div>;
}

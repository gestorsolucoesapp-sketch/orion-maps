"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Coordinate } from "@/lib/flight-plan";
import { accuracyRing } from "@/lib/location-circle";
const basemaps={
 streets:{label:"Mapa",url:"https://tile.openstreetmap.org/{z}/{x}/{y}.png",maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'},
 satellite:{label:"Satélite",url:"https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",maxzoom:19,attribution:'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>, Vantor, Earthstar Geographics, GIS User Community'},
 topo:{label:"Topográfico",url:"https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",maxzoom:19,attribution:'Sources: Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), © OpenStreetMap contributors, GIS User Community'},
 relief:{label:"Relevo",url:"https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",maxzoom:13,attribution:'Shaded relief © 2014 <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>'}
} as const;
type Basemap=keyof typeof basemaps;
type Props={adjustingPosition?:boolean;onPositionPick?:(p:Coordinate)=>void;userPosition:{point:Coordinate;accuracy:number;source?:"manual"}|null;points:Coordinate[];legs:Coordinate[][];polygon:boolean;drawing:boolean;center:Coordinate|null;fit:number;onAdd:(p:Coordinate)=>void;onMove:(i:number,p:Coordinate)=>void};
export default function PlanningCanvas(props:Props){
 const el=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),latest=useRef(props);
 const [ready,setReady]=useState(false),[error,setError]=useState("");
 const [basemap,setBasemap]=useState<Basemap>("streets");
 useEffect(()=>{latest.current=props;});
 useEffect(()=>{
  if(!el.current)return;
  let m:maplibregl.Map;
  try{
   maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
   // Only visible map tiles are requested; browser caching follows the provider headers.
   m=new maplibregl.Map({container:el.current,center:[-52,-14],zoom:4,dragRotate:false,pitchWithRotate:false,renderWorldCopies:false,attributionControl:false,style:{version:8,sources:{basemap:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}},layers:[{id:"background",type:"background",paint:{"background-color":"#c9ccc3"}},{id:"basemap",type:"raster",source:"basemap"}]}});map.current=m;
   m.addControl(new maplibregl.AttributionControl({compact:false}),"bottom-right");
   m.on("error",e=>{if("sourceId" in e&&e.sourceId==="basemap")setError("O mapa de fundo não carregou. Confira sua conexão e recarregue. Seus pontos continuam no editor.");});
   m.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-left");m.addControl(new maplibregl.ScaleControl({unit:"metric"}),"bottom-left");
   m.on("load",()=>{
    const empty:GeoJSON.FeatureCollection={type:"FeatureCollection",features:[]};
    m.addSource("location-accuracy",{type:"geojson",data:empty});
    m.addLayer({id:"location-accuracy-fill",type:"fill",source:"location-accuracy",paint:{"fill-color":"#1387bd","fill-opacity":0.14}});
    m.addLayer({id:"location-accuracy-line",type:"line",source:"location-accuracy",paint:{"line-color":"#1387bd","line-width":2}});
    m.addSource("boundary",{type:"geojson",data:empty});m.addSource("legs",{type:"geojson",data:empty});
    m.addLayer({id:"area",type:"fill",source:"boundary",paint:{"fill-color":"#dd784b","fill-opacity":0.15}});
    m.addLayer({id:"outline",type:"line",source:"boundary",paint:{"line-color":"#303c42","line-width":2,"line-dasharray":[3,2]}});
    m.addLayer({id:"route",type:"line",source:"legs",paint:{"line-color":"#ba5429","line-width":3}});setReady(true);
   });
   m.on("click",e=>{if(latest.current.adjustingPosition){latest.current.onPositionPick?.([e.lngLat.lng,e.lngLat.lat]);return;}if(latest.current.drawing)latest.current.onAdd([e.lngLat.lng,e.lngLat.lat]);});
  }catch{
   // A failed external WebGL initialization must surface in the UI once.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   setError("O editor exige aceleração gráfica. Ative-a no navegador e recarregue.");
  }
  return()=>{m?.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;
  const selected=basemaps[basemap];
  // Replace only the background: mission geometry, location and camera stay intact.
  m.removeLayer("basemap");m.removeSource("basemap");
  m.addSource("basemap",{type:"raster",tiles:[selected.url],tileSize:256,maxzoom:selected.maxzoom,attribution:selected.attribution});
  m.addLayer({id:"basemap",type:"raster",source:"basemap"},"location-accuracy-fill");
 },[ready,basemap]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;
  (m.getSource("boundary") as GeoJSONSource).setData({type:"FeatureCollection",features:props.polygon&&props.points.length>=3?[{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[[...props.points,props.points[0]]]}}]:[]});
  (m.getSource("legs") as GeoJSONSource).setData({type:"Feature",properties:{},geometry:{type:"MultiLineString",coordinates:props.legs}});
  const markers=props.points.map((p,i)=>{const element=document.createElement("div");element.className="flight-marker";element.textContent=String(i+1);element.title=`Ponto ${i+1}: arraste para ajustar`;const marker=new maplibregl.Marker({element,draggable:!props.adjustingPosition}).setLngLat(p).addTo(m);marker.on("dragend",()=>{const p=marker.getLngLat();latest.current.onMove(i,[p.lng,p.lat]);});return marker;});
  m.getCanvas().style.cursor=(props.drawing||props.adjustingPosition)?"crosshair":"grab";return()=>markers.forEach(m=>m.remove());
 },[ready,props.points,props.legs,props.polygon,props.drawing,props.adjustingPosition]);
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
 useEffect(()=>{if(ready&&props.center)map.current?.flyTo({center:props.center,zoom:17});},[ready,props.center]);
 useEffect(()=>{if(!ready||!props.fit||!latest.current.points.length)return;const points=latest.current.points,bounds=new maplibregl.LngLatBounds(points[0],points[0]);points.forEach(p=>bounds.extend(p));map.current?.fitBounds(bounds,{padding:60,maxZoom:19});},[ready,props.fit]);
 return <div className="mission-map-wrap"><div ref={el} className="mission-map" aria-label="Mapa de planejamento de waypoints"/>{error&&<p role="alert" className="map-error">{error}</p>}<label className="basemap-selector">Camada do mapa<select aria-label="Camada do mapa" value={basemap} onChange={e=>{setError("");setBasemap(e.target.value as Basemap);}}>{Object.entries(basemaps).map(([id,layer])=><option key={id} value={id}>{layer.label}</option>)}</select>{basemap==="relief"&&<small>Afaste o mapa para ver o relevo regional. Não ajusta a altura do voo.</small>}</label><div className="map-key"><span>● Pontos editáveis</span><span>━ Faixas de levantamento</span></div></div>;
}

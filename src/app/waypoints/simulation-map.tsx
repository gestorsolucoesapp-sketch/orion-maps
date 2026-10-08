"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {Coordinate} from "@/lib/flight-plan";
import {simulationTrace,type FlightFrame,type FlightSimulation} from "@/lib/flight-simulation";
import {SimulationDrone} from "./simulation-drone";
import {streetBasemap,esriImagery} from "@/lib/basemaps";

type Props={simulation:FlightSimulation;frame:FlightFrame;boundary:Coordinate[];running:boolean;pickHome:boolean;onPick:(point:Coordinate)=>void;onReady:(ready:boolean)=>void;children:ReactNode};
const empty:GeoJSON.FeatureCollection={type:"FeatureCollection",features:[]};
const raster={satellite:esriImagery,map:streetBasemap};
export default function SimulationMap(props:Props){
 const element=useRef<HTMLDivElement>(null),map=useRef<maplibre.Map|null>(null),drone=useRef<SimulationDrone|null>(null),latest=useRef(props),lastTrace=useRef(-1),lastPhoto=useRef(-1);
 const [ready,setReady]=useState(false),[error,setError]=useState(""),[background,setBackground]=useState<keyof typeof raster>("satellite"),[perspective,setPerspective]=useState(false),[follow,setFollow]=useState(false);
 const view=useRef({perspective,follow,background});
 useEffect(()=>{latest.current=props;});useEffect(()=>{view.current={perspective,follow,background};},[perspective,follow,background]);
 function fit(){const m=map.current;if(!m)return;const sim=latest.current.simulation,b=new maplibre.LngLatBounds(sim.home,sim.home);sim.route.forEach(p=>b.extend(p));if(view.current.perspective){const margin=sim.height*1.2/111195,longitudeMargin=margin/Math.cos(sim.home[1]*Math.PI/180);b.extend([b.getWest()-longitudeMargin,b.getSouth()-margin]);b.extend([b.getEast()+longitudeMargin,b.getNorth()+margin]);}m.fitBounds(b,{padding:{top:70,left:55,right:55,bottom:155},maxZoom:18,duration:0,pitch:view.current.perspective?45:0,bearing:0});}
 useEffect(()=>{
  if(!element.current)return;
  setReady(false);setError("");latest.current.onReady(false);lastTrace.current=-1;lastPhoto.current=-1;
  let m:maplibre.Map|undefined,observer:ResizeObserver|undefined;const markers:maplibre.Marker[]=[];
  try{
   maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");const base=raster[view.current.background]??esriImagery;
   m=new maplibre.Map({container:element.current,center:props.simulation.home,zoom:16,renderWorldCopies:false,attributionControl:false,pitchWithRotate:false,dragRotate:false,style:{version:8,sources:{base:{type:"raster",tiles:[base.url],tileSize:256,maxzoom:base.maxzoom,attribution:base.attribution}},layers:[{id:"background",type:"background",paint:{"background-color":"#dce6df"}},{id:"base",type:"raster",source:"base"}]}});
   const current=m;map.current=m;
   current.addControl(new maplibre.NavigationControl({showCompass:false}),"top-right");current.addControl(new maplibre.ScaleControl({unit:"metric"}),"bottom-left");current.addControl(new maplibre.AttributionControl({compact:true}),"bottom-right");
   current.on("load",()=>{
    if(map.current!==current)return;
    const sim=latest.current.simulation;
    current.addSource("boundary",{type:"geojson",data:{type:"FeatureCollection",features:latest.current.boundary.length>=3?[{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[[...latest.current.boundary,latest.current.boundary[0]]]}}]:[]}});
    current.addLayer({id:"boundary-fill",type:"fill",source:"boundary",paint:{"fill-color":"#16764b","fill-opacity":.07}});current.addLayer({id:"boundary-line",type:"line",source:"boundary",paint:{"line-color":"#256347","line-width":1.5,"line-dasharray":[3,2]}});
    current.addSource("sim-route",{type:"geojson",data:{type:"FeatureCollection",features:sim.segments.filter(s=>s.distanceEnd>s.distanceStart).map(s=>({type:"Feature",properties:{phase:s.phase},geometry:{type:"LineString",coordinates:[s.from,s.to]}}))}});
    current.addLayer({id:"sim-route-line",type:"line",source:"sim-route",paint:{"line-color":["match",["get","phase"],"survey","#087b54","connection","#64748b","#287acc"],"line-width":2.5,"line-opacity":.8}});
    current.addSource("sim-trace",{type:"geojson",data:empty});current.addLayer({id:"sim-trace-line",type:"line",source:"sim-trace",paint:{"line-color":"#10b981","line-width":5,"line-opacity":.95}});
    const step=Math.max(1,Math.ceil(sim.photos.length/2000));
    current.addSource("sim-photos",{type:"geojson",data:{type:"FeatureCollection",features:sim.photos.filter((_,i)=>i%step===0).map(p=>({type:"Feature",properties:{number:p.number},geometry:{type:"Point",coordinates:p.position}}))}});
    current.addLayer({id:"sim-photo-planned",type:"circle",source:"sim-photos",paint:{"circle-color":"#fff","circle-stroke-color":"#576c63","circle-stroke-width":1,"circle-radius":2,"circle-opacity":.6}});
    current.addLayer({id:"sim-photo-taken",type:"circle",source:"sim-photos",filter:["<=",["get","number"],0],paint:{"circle-color":"#ffad33","circle-stroke-color":"#6f3d07","circle-stroke-width":1,"circle-radius":3.5}});
    current.addSource("sim-position",{type:"geojson",data:empty});current.addLayer({id:"sim-position-shadow",type:"circle",source:"sim-position",paint:{"circle-color":"#0b2731","circle-opacity":.4,"circle-radius":13,"circle-blur":.5}});
    const model=new SimulationDrone();drone.current=model;model.frame={...latest.current.frame,height:view.current.perspective?latest.current.frame.height:0};
    try{current.addLayer(model);}catch{setError("A visualização 3D não iniciou. O ponto escuro no mapa mostra a posição simulada.");}
    const home=document.createElement("div");home.className="sim-home-marker";home.textContent="H";home.title="Base apenas da simulação";home.setAttribute("aria-label","Base de decolagem simulada");markers.push(new maplibre.Marker({element:home}).setLngLat(sim.home).addTo(current));
    fit();setReady(true);latest.current.onReady(true);current.triggerRepaint();
   });
   current.on("click",e=>{if(latest.current.pickHome)latest.current.onPick([e.lngLat.lng,e.lngLat.lat]);});
   current.on("dragstart",()=>setFollow(false));
   current.on("error",e=>{if("sourceId" in e&&e.sourceId==="base")setError("Mapa-base indisponível. A rota e os controles da simulação continuam disponíveis.");});
   current.on("render",()=>{if(element.current&&drone.current)element.current.dataset.droneFrames=String(drone.current.renderCount);});
   observer=new ResizeObserver(()=>{current.resize();});observer.observe(element.current);
  }catch{
   // eslint-disable-next-line react-hooks/set-state-in-effect -- Surface a failed external WebGL initialization.
   setError("A simulação visual exige WebGL. Ative a aceleração gráfica e reabra esta aba.");
  }
  return()=>{observer?.disconnect();markers.forEach(marker=>marker.remove());m?.remove();map.current=null;drone.current=null;latest.current.onReady(false);};
 // Only a new simulation snapshot recreates this external renderer.
 },[props.simulation]);
 useEffect(()=>{const m=map.current;if(!m||!ready)return;const f=props.frame,sim=props.simulation;if(drone.current){drone.current.frame={...f,height:perspective?f.height:0};drone.current.rotorAngle=props.running?f.time*18:drone.current.rotorAngle;}
  (m.getSource("sim-position") as maplibre.GeoJSONSource).setData({type:"Feature",properties:{},geometry:{type:"Point",coordinates:f.position}});
  if(Math.abs(f.time-lastTrace.current)>=.12||f.finished||f.time===0){(m.getSource("sim-trace") as maplibre.GeoJSONSource).setData({type:"Feature",properties:{},geometry:{type:"LineString",coordinates:simulationTrace(sim,f)}});lastTrace.current=f.time;}
  if(lastPhoto.current!==f.photosTaken){m.setFilter("sim-photo-taken",["<=",["get","number"],f.photosTaken]);lastPhoto.current=f.photosTaken;}
  if(view.current.follow)m.jumpTo({center:f.position});m.triggerRepaint();
 },[ready,props.frame,props.simulation,props.running,perspective]);
 useEffect(()=>{const m=map.current;if(!m||!ready)return;const base=raster[background]??esriImagery;m.removeLayer("base");m.removeSource("base");m.addSource("base",{type:"raster",tiles:[base.url],tileSize:256,maxzoom:base.maxzoom,attribution:base.attribution});m.addLayer({id:"base",type:"raster",source:"base"},"boundary-fill");},[ready,background]);
 useEffect(()=>{if(ready){view.current.perspective=perspective;fit();}},[ready,perspective]);
 useEffect(()=>{if(map.current)map.current.getCanvas().style.cursor=props.pickHome?"crosshair":"grab";},[props.pickHome,ready]);
 return <div className="sim-map-shell">
  <div ref={element} className="sim-map" data-testid="simulation-map" data-ready={ready} data-phase={props.frame.phase} data-altitude={props.frame.height.toFixed(3)} data-lng={props.frame.position[0]} data-lat={props.frame.position[1]} aria-label="Mapa da simulação de voo, sem controle do drone"/>
  <div className="sim-view-tools"><button type="button" aria-pressed={perspective} onClick={()=>setPerspective(v=>!v)}>{perspective?"Vista 2D":"Vista 3D"}</button><button type="button" aria-pressed={follow} onClick={()=>setFollow(v=>!v)}>Seguir drone</button><button type="button" onClick={()=>{setFollow(false);fit();}}>Enquadrar rota</button><select aria-label="Fundo da simulação" value={background} onChange={e=>{setError("");setBackground(e.target.value as keyof typeof raster);}}><option value="satellite">{esriImagery.label}</option><option value="map">{streetBasemap.label}</option></select></div>
  {props.pickHome&&<p role="status" className="sim-pick-message">Toque no mapa para definir a base apenas desta simulação.</p>}
  {error&&<p role="alert" className="sim-map-error">{error}</p>}
  {props.children}
 </div>;
}

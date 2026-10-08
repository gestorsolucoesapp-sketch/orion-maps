"use client";
import {useEffect,useRef,useState} from "react";
import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {ImportedMapLocation} from "@/lib/google-maps-location";
export default function LocationPreviewMap({location}:{location:ImportedMapLocation}){
 const element=useRef<HTMLDivElement>(null),[error,setError]=useState("");
 useEffect(()=>{
  if(!element.current)return;let map:maplibre.Map|undefined,observer:ResizeObserver|undefined;
  try{
   maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
   map=new maplibre.Map({container:element.current,center:[location.lon,location.lat],zoom:location.zoom,renderWorldCopies:false,dragRotate:false,pitchWithRotate:false,attributionControl:false,style:{version:8,sources:{base:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}},layers:[{id:"base",type:"raster",source:"base"}]}});
   const current=map;current.addControl(new maplibre.NavigationControl({showCompass:false}),"top-right");current.addControl(new maplibre.AttributionControl({compact:true}),"bottom-right");
   const marker=new maplibre.Marker({color:"#176953"}).setLngLat([location.lon,location.lat]).addTo(current);marker.getElement().setAttribute("aria-label","Ponto encontrado para conferência");
   current.on("load",()=>{if(element.current)element.current.dataset.ready="true";});
   current.on("error",()=>setError("Mapa de conferência indisponível. As coordenadas continuam visíveis."));
   observer=new ResizeObserver(()=>current.resize());observer.observe(element.current);
  }catch{
   // eslint-disable-next-line react-hooks/set-state-in-effect -- Report a failure of the external renderer without changing imported coordinates.
   setError("Não foi possível exibir a conferência gráfica. Verifique as coordenadas.");
  }
  return()=>{observer?.disconnect();map?.remove();};
 },[location]);
 return <><div ref={element} className="maps-import-preview" data-testid="maps-import-preview" data-lat={location.lat} data-lon={location.lon} aria-label="Conferir localização importada"/>{error&&<p role="alert" className="maps-import-error">{error}</p>}</>;
}

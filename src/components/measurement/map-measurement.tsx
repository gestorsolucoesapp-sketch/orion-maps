"use client";
import {useEffect,useMemo,useReducer,useRef,useState} from "react";
import {Marker,type Map as LibreMap,type GeoJSONSource,type MapMouseEvent,type IControl} from "maplibre-gl";
import {areaUnits,distanceUnits,isMeasurePoint,measureDrawing,measureMidpoint,measureNumber,measurementGeoJSON,requireMeasurement,validateMeasureDrawing,type AreaUnit,type DistanceUnit,type MeasureDrawing,type MeasurePoint} from "@/lib/map-measurement";
import {setMeasuringMap} from "@/lib/measurement-map-state";
import {listMeasurements,saveMeasurement,type SavedMeasurement} from "./actions";
import "./measurement.css";

type State={drawing:MeasureDrawing;past:MeasureDrawing[];future:MeasureDrawing[]};
type Action={type:"change";drawing:MeasureDrawing}|{type:"undo"|"redo"};
function reducer(s:State,a:Action):State{
 if(a.type==="change")return {drawing:a.drawing,past:[...s.past.slice(-49),s.drawing],future:[]};
 if(a.type==="undo"&&s.past.length)return {drawing:s.past.at(-1)!,past:s.past.slice(0,-1),future:[s.drawing,...s.future]};
 if(a.type==="redo"&&s.future.length)return {drawing:s.future[0],past:[...s.past,s.drawing],future:s.future.slice(1)};
 return s;
}
const empty:GeoJSON.FeatureCollection={type:"FeatureCollection",features:[]};
type Props={map:LibreMap|null;surveyId?:string|null;disabled?:boolean;onActiveChange?:(active:boolean)=>void;onDrawingChange?:(drawing:MeasureDrawing,name:string)=>void;startAreaRevision?:number;startPathRevision?:number};
export default function MapMeasurement({map,surveyId=null,disabled=false,onActiveChange,onDrawingChange,startAreaRevision=0,startPathRevision=0}:Props){
 const [state,dispatch]=useReducer(reducer,{drawing:{kind:"polygon",points:[]},past:[],future:[]});
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[name,setName]=useState("Minha medição");
 const [areaUnit,setAreaUnit]=useState<AreaUnit>("m2"),[distanceUnit,setDistanceUnit]=useState<DistanceUnit>("m"),[picked,setPicked]=useState<number|null>(null);
 const [live,setLive]=useState<MeasurePoint[]|null>(null),[saved,setSaved]=useState<SavedMeasurement[]|null>(null);
 const requestId=useRef<string|null>(null),latest=useRef<{drawing:MeasureDrawing;busy:boolean;change:(d:MeasureDrawing)=>void}>({drawing:state.drawing,busy,change:()=>{}});
 const drawing=state.drawing,points=live||drawing.points;
 const metrics=useMemo(()=>{try{return measureDrawing({kind:drawing.kind,points});}catch(e){return {area_m2:null,perimeter_m:null,distance_m:0,complete:false,issue:e instanceof Error?e.message:"Revise os pontos."};}},[drawing.kind,points]);
 function change(d:MeasureDrawing){try{const next=validateMeasureDrawing(d);requestId.current=null;dispatch({type:"change",drawing:next});setMessage("");setPicked(null);}catch(e){setMessage(e instanceof Error?e.message:"Ponto inválido.");}}
 useEffect(()=>{latest.current={drawing,busy,change};});
 useEffect(()=>{onDrawingChange?.({kind:drawing.kind,points},name);},[drawing.kind,points,name,onDrawingChange]);
 useEffect(()=>{
  if(!startAreaRevision)return;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Parent command opens the existing map drawing control, without erasing vertices.
  setOpen(true);const d=latest.current.drawing;if(d.kind!=="polygon")latest.current.change({...d,kind:"polygon"});
 },[startAreaRevision]);
 useEffect(()=>{
  if(!startPathRevision)return;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Parent command opens the existing path control.
  setOpen(true);const d=latest.current.drawing;if(d.kind!=="path")latest.current.change({...d,kind:"path"});
 },[startPathRevision]);
 useEffect(()=>{onActiveChange?.(open);return()=>onActiveChange?.(false);},[open,onActiveChange]);
 useEffect(()=>{
  if(!map)return;
  const element=document.createElement("div"),button=document.createElement("button");element.className="maplibregl-ctrl maplibregl-ctrl-group";
  button.type="button";button.title="Medir distância e área";button.setAttribute("aria-label","Medir distância e área");button.textContent="📏";button.style.cssText="width:40px;height:40px;font-size:20px";button.disabled=disabled;button.onclick=()=>setOpen(v=>!v);element.append(button);
  const control:IControl={onAdd:()=>element,onRemove:()=>element.remove()};map.addControl(control,"top-left");
  return()=>{if(map.hasControl(control))map.removeControl(control);};
 },[map,disabled]);
 useEffect(()=>{
  if(!map||!open)return;
  const zoom=map.doubleClickZoom.isEnabled(),cursor=map.getCanvas().style.cursor;
  setMeasuringMap(map,true);map.getContainer().classList.add("orion-measuring");map.doubleClickZoom.disable();map.getCanvas().style.cursor="crosshair";
  if(!map.getSource("orion-measure")){map.addSource("orion-measure",{type:"geojson",data:empty});map.addLayer({id:"orion-measure-fill",source:"orion-measure",type:"fill",filter:["==",["geometry-type"],"Polygon"],paint:{"fill-color":"#fff6bb","fill-opacity":0.24}});map.addLayer({id:"orion-measure-line",source:"orion-measure",type:"line",paint:{"line-color":"#ffcf40","line-width":3}});}
  const click=(e:MapMouseEvent)=>{const s=latest.current;if(s.busy||s.drawing.points.length>=200)return;const p:MeasurePoint=[e.lngLat.lng,e.lngLat.lat];if(isMeasurePoint(p))s.change({...s.drawing,points:[...s.drawing.points,p]});};
  map.on("click",click);
  return()=>{map.off("click",click);setMeasuringMap(map,false);map.getContainer().classList.remove("orion-measuring");map.getCanvas().style.cursor=cursor;if(zoom)map.doubleClickZoom.enable();try{for(const id of ["orion-measure-line","orion-measure-fill"])if(map.getLayer(id))map.removeLayer(id);if(map.getSource("orion-measure"))map.removeSource("orion-measure");}catch{/* Parent map may already be disposed. */}};
 },[map,open]);
 useEffect(()=>{
  if(!map||!open)return;const features:GeoJSON.Feature[]=[];
  if(points.length>=2)features.push({type:"Feature",properties:{},geometry:drawing.kind==="polygon"&&points.length>=3?{type:"Polygon",coordinates:[[...points,points[0]]]}:{type:"LineString",coordinates:points}});
  (map.getSource("orion-measure") as GeoJSONSource|undefined)?.setData({type:"FeatureCollection",features});
  for(const id of ["orion-measure-fill","orion-measure-line"])if(map.getLayer(id))map.moveLayer(id);
 },[map,open,points,drawing.kind]);
 useEffect(()=>{
  if(!map||!open)return;const markers:Marker[]=[];
  function handle(p:MeasurePoint,index:number,midpoint:boolean){
   const element=document.createElement("button");element.type="button";element.className=midpoint?"orion-measure-midpoint":"orion-measure-vertex";
   element.setAttribute("aria-label",midpoint?`Inserir vértice após ${index+1}`:`Vértice de medição ${index+1}`);element.title=midpoint?"Toque ou arraste para inserir um vértice":"Arraste para ajustar; toque para selecionar";
   const marker=new Marker({element,draggable:!busy}).setLngLat(p).addTo(map!);markers.push(marker);
   let dragged=false;
   const candidate=(point:MeasurePoint)=>{const next=[...latest.current.drawing.points];if(midpoint)next.splice(index+1,0,point);else next[index]=point;return next;};
   marker.on("dragstart",()=>{dragged=true;});
   marker.on("drag",()=>{const p=marker.getLngLat();setLive(candidate([p.lng,p.lat]));});
   marker.on("dragend",()=>{const p=marker.getLngLat();setLive(null);latest.current.change({...latest.current.drawing,points:candidate([p.lng,p.lat])});});
   element.addEventListener("click",e=>{e.stopPropagation();if(busy||dragged)return;if(midpoint)latest.current.change({...latest.current.drawing,points:candidate(p)});else setPicked(index);});
   element.addEventListener("keydown",e=>{if(busy)return;if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();const xy=map!.project(marker.getLngLat()),step=e.shiftKey?10:1;if(e.key==="ArrowUp")xy.y-=step;if(e.key==="ArrowDown")xy.y+=step;if(e.key==="ArrowLeft")xy.x-=step;if(e.key==="ArrowRight")xy.x+=step;const p=map!.unproject(xy);latest.current.change({...latest.current.drawing,points:candidate([p.lng,p.lat])});}});
  }
  drawing.points.forEach((p,i)=>handle(p,i,false));
  if(drawing.points.length<200){const n=drawing.kind==="polygon"&&drawing.points.length>=3?drawing.points.length:drawing.points.length-1;for(let i=0;i<n;i++)handle(measureMidpoint(drawing.points[i],drawing.points[(i+1)%drawing.points.length]),i,true);}
  return()=>markers.forEach(m=>m.remove());
 },[map,open,drawing,busy]);
 function undo(type:"undo"|"redo"){requestId.current=null;setPicked(null);setMessage("");dispatch({type});}
 function fit(d:MeasureDrawing=drawing){if(!map||!d.points.length)return;const west=Math.min(...d.points.map(p=>p[0])),east=Math.max(...d.points.map(p=>p[0])),south=Math.min(...d.points.map(p=>p[1])),north=Math.max(...d.points.map(p=>p[1]));map.fitBounds([[west,south],[east,north]],{padding:55,maxZoom:20,duration:350});}
 async function save(){setBusy(true);try{requestId.current ||= crypto.randomUUID();const result=await saveMeasurement({id:requestId.current,name,survey_id:surveyId,measurement:{schema_version:1,...drawing}});setMessage(result.error||(surveyId?"Medição salva neste projeto. Versões anteriores preservadas.":"Medição salva na sua conta. Reabra em Medições salvas."));}catch{setMessage("Falha de conexão. O desenho permanece aqui; tente salvar novamente.");}finally{setBusy(false);}}
 async function load(){setBusy(true);try{const result=await listMeasurements(surveyId);setSaved(result.rows);setMessage(result.error);}catch{setMessage("Não foi possível carregar. Seu desenho foi mantido.");}finally{setBusy(false);}}
 function exportFile(){try{const value=measurementGeoJSON(name,requireMeasurement({schema_version:1,...drawing})),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/geo+json"})),a=document.createElement("a");a.href=url;a.download=(name.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,80)||"medicao")+".geojson";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){setMessage(e instanceof Error?e.message:"Revise a medição.");}}
 return <section className="orion-measurement" data-testid="measurement-tool" data-open={open?"true":"false"}>
  <button type="button" className="measure-launch" disabled={!map||disabled} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>📏 {open?"Fechar medição":"Medir no mapa"}<span>Distância · área · perímetro</span></button>
  {open&&<div className="measure-sheet" data-testid="measurement-panel">
   <header><h3>Caminho ou polígono</h3><button aria-label="Fechar régua" disabled={busy} onClick={()=>setOpen(false)}>×</button></header>
   <div className="measure-modes"><button disabled={busy} aria-pressed={drawing.kind==="path"} onClick={()=>change({...drawing,kind:"path"})}>Caminho</button><button disabled={busy} aria-pressed={drawing.kind==="polygon"} onClick={()=>change({...drawing,kind:"polygon"})}>Polígono / área</button><button disabled={busy||!drawing.points.length} onClick={()=>fit()}>Enquadrar</button></div>
   <p className="measure-help">Toque no mapa para adicionar pontos. Arraste os círculos brancos para ajustar; os menores inserem novos vértices. {drawing.points.length}/200 pontos.</p>
   <div className="measure-values" aria-live="polite">
    {drawing.kind==="polygon"&&<label>Área<strong data-testid="measurement-area">{measureNumber(metrics.area_m2,areaUnits[areaUnit].factor)} <small>{areaUnits[areaUnit].label}</small></strong><select aria-label="Unidade de área" value={areaUnit} onChange={e=>setAreaUnit(e.target.value as AreaUnit)}>{Object.entries(areaUnits).map(([key,u])=><option key={key} value={key}>{u.label}</option>)}</select></label>}
    <label>{drawing.kind==="path"?"Comprimento":"Perímetro"}<strong data-testid="measurement-distance">{measureNumber(drawing.kind==="path"?(drawing.points.length>=2?metrics.distance_m:null):metrics.perimeter_m,distanceUnits[distanceUnit].factor)} <small>{distanceUnits[distanceUnit].label}</small></strong><select aria-label="Unidade de distância" value={distanceUnit} onChange={e=>setDistanceUnit(e.target.value as DistanceUnit)}>{Object.entries(distanceUnits).map(([key,u])=><option key={key} value={key}>{u.label}</option>)}</select></label>
   </div>
   <div className="measure-edit"><button aria-label="Desfazer medição" disabled={busy||!state.past.length} onClick={()=>undo("undo")}>↶ Desfazer</button><button aria-label="Refazer medição" disabled={busy||!state.future.length} onClick={()=>undo("redo")}>↷ Refazer</button><button disabled={busy||!drawing.points.length} onClick={()=>change({...drawing,points:[]})}>Limpar desenho</button>{picked!==null&&picked<drawing.points.length&&<button disabled={busy} onClick={()=>change({...drawing,points:drawing.points.filter((_,i)=>i!==picked)})}>Remover vértice {picked+1}</button>}</div>
   {metrics.issue&&<p role="alert" className="measure-warning">{metrics.issue}</p>}
   <label className="measure-name">Nome da medição<input aria-label="Nome da medição" value={name} maxLength={120} disabled={busy} onChange={e=>{setName(e.target.value);requestId.current=null;}}/></label>
   <div className="measure-edit"><button className="measure-save" disabled={busy||!metrics.complete||!name.trim()} onClick={()=>void save()}>{busy?"Aguarde…":surveyId?"Salvar no projeto":"Salvar na minha conta"}</button><button disabled={busy} onClick={()=>void load()}>Medições salvas</button><button disabled={!metrics.complete||busy} onClick={exportFile}>Exportar GeoJSON</button></div>
   {message&&<p role="status" className="measure-warning">{message}</p>}
   {saved!==null&&<div className="measure-saved"><header><strong>Medições salvas · últimas 100</strong><button aria-label="Fechar medições salvas" onClick={()=>setSaved(null)}>×</button></header>{saved.length?saved.map(row=><button key={row.id} disabled={busy} onClick={()=>{if(drawing.points.length&&!window.confirm("Abrir a medição salva? O desenho atual ficará disponível em Desfazer."))return;change(row.measurement);setName(row.name);setSaved(null);fit(row.measurement);setMessage("Medição aberta. Alterações serão salvas como uma nova versão.");}}>{row.name}<small>{row.measurement.kind==="polygon"?"Polígono":"Caminho"} · {new Date(row.created_at).toLocaleString("pt-BR")}</small></button>):<p>Nenhuma medição salva nesta seleção.</p>}</div>}
   <p className="measure-disclaimer">Medidas horizontais no elipsoide WGS84. Não incluem relevo, altura, área de superfície ou precisão de levantamento. A posição depende da imagem e dos pontos marcados; casas decimais não garantem precisão centimétrica. A régua não altera o plano de voo nem o processamento.</p>
  </div>}
 </section>;
}

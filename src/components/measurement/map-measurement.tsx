"use client";
import {useEffect,useMemo,useReducer,useRef,useState} from "react";
import {createPortal} from "react-dom";
import InfoPopover from "@/components/info-popover";
import MapMeasureToolbar from "./map-measure-toolbar";
import {EMPTY_TERRAIN_FEEDBACK,type MapMeasureTool,type TerrainToolAction,type TerrainToolFeedback} from "@/lib/map-toolbox";
import {Marker,type Map as LibreMap,type GeoJSONSource,type MapMouseEvent,type IControl} from "maplibre-gl";
import {areaUnits,distanceUnits,isMeasurePoint,measureDrawing,measureMidpoint,measureNumber,measurementGeoJSON,requireMeasurement,validateMeasureDrawing,type AreaUnit,type DistanceUnit,type MeasureDrawing,type MeasurePoint} from "@/lib/map-measurement";
import {lockMapToolInteraction,setMeasuringMap} from "@/lib/measurement-map-state";
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
type Props={initialDrawing?:MeasureDrawing;embedded?:boolean;map:LibreMap|null;surveyId?:string|null;disabled?:boolean;onActiveChange?:(active:boolean)=>void;onDrawingChange?:(drawing:MeasureDrawing,name:string)=>void;startAreaRevision?:number;startPathRevision?:number;floating?:boolean;terrainAvailable?:boolean;terrainFeedback?:TerrainToolFeedback;onToolChange?:(tool:MapMeasureTool|null)=>void;onTerrainAction?:(action:TerrainToolAction)=>void};
export default function MapMeasurement({initialDrawing,embedded=false,map,surveyId=null,disabled=false,onActiveChange,onDrawingChange,startAreaRevision=0,startPathRevision=0,floating=false,terrainAvailable=false,terrainFeedback=EMPTY_TERRAIN_FEEDBACK,onToolChange,onTerrainAction}:Props){
 const [state,dispatch]=useReducer(reducer,initialDrawing,(initial):State=>({drawing:initial?validateMeasureDrawing(initial):{kind:floating?"path":"polygon",points:[]},past:[],future:[]}));
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[name,setName]=useState("Minha medição");
 const [areaUnit,setAreaUnit]=useState<AreaUnit>("m2"),[distanceUnit,setDistanceUnit]=useState<DistanceUnit>("m"),[picked,setPicked]=useState<number|null>(null);
 const [live,setLive]=useState<MeasurePoint[]|null>(null),[saved,setSaved]=useState<SavedMeasurement[]|null>(null);
 const requestId=useRef<string|null>(null),latest=useRef<{drawing:MeasureDrawing;busy:boolean;change:(d:MeasureDrawing)=>void}>({drawing:state.drawing,busy,change:()=>{}});
 const [tool,setTool]=useState<MapMeasureTool>(initialDrawing?.points.length?(initialDrawing.kind==="polygon"?"area":"distance"):floating?"distance":"area"),[finished,setFinished]=useState(false),[detailsOpen,setDetailsOpen]=useState(false);
 const [drawingError,setDrawingError]=useState(""),[optionsOpen,setOptionsOpen]=useState(false);
 const detailsRef=useRef<HTMLDivElement>(null);
 const drawing=state.drawing,points=live||drawing.points;
 const editing=!!map&&!disabled&&open&&(!floating||(!finished&&tool!=="slope"));
 const showDrawing=floating?(tool!=="slope"&&(open||points.length>0)):open;
 const showPanel=embedded?detailsOpen:floating?(detailsOpen||(points.length>0&&(finished||!open))):open;
 const metrics=useMemo(()=>{try{return measureDrawing({kind:drawing.kind,points});}catch(e){return {area_m2:null,perimeter_m:null,distance_m:0,complete:false,issue:e instanceof Error?e.message:"Revise os pontos."};}},[drawing.kind,points]);
 function change(d:MeasureDrawing){try{const next=validateMeasureDrawing(d);requestId.current=null;dispatch({type:"change",drawing:next});setFinished(false);setOptionsOpen(false);setMessage("");setDrawingError("");setPicked(null);}catch(e){const error=e instanceof Error?e.message:"Ponto inválido.";setDrawingError(error);setMessage(error);}}
 useEffect(()=>{latest.current={drawing,busy:busy||!editing,change};});
 useEffect(()=>{onDrawingChange?.({kind:drawing.kind,points},name);},[drawing.kind,points,name,onDrawingChange]);
 useEffect(()=>{
  if(!startAreaRevision)return;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Parent command opens the existing map drawing control, without erasing vertices.
  setOpen(true);setOptionsOpen(false);setTool("area");setFinished(false);const d=latest.current.drawing;if(d.kind!=="polygon")latest.current.change({...d,kind:"polygon"});
 },[startAreaRevision]);
 useEffect(()=>{
  if(!startPathRevision)return;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Parent command opens the existing path control.
  setOpen(true);setOptionsOpen(false);setTool("profile");setFinished(false);const d=latest.current.drawing;if(d.kind!=="path")latest.current.change({kind:"path",points:[]});
 },[startPathRevision]);
 useEffect(()=>{onActiveChange?.(editing);return()=>onActiveChange?.(false);},[editing,onActiveChange]);
 useEffect(()=>{if(floating)onToolChange?.(open?tool:null);return()=>{if(floating)onToolChange?.(null);};},[floating,open,tool,onToolChange]);
 useEffect(()=>{
  if(!map||!floating||!open||!optionsOpen)return;
  const collapseOptions=(event:MapMouseEvent)=>{
   if(!(event.originalEvent.target as Element)?.closest("button,[data-map-tool-ui],.maplibregl-control-container"))setOptionsOpen(false);
  };
  map.on("click",collapseOptions);
  return()=>{map.off("click",collapseOptions);};
 },[map,floating,open,optionsOpen]);
 useEffect(()=>{
  if(!map||floating)return;
  const element=document.createElement("div"),button=document.createElement("button");element.className="maplibregl-ctrl maplibregl-ctrl-group";
  button.type="button";button.title="Medir distância e área";button.setAttribute("aria-label","Medir distância e área");button.textContent="📏";button.style.cssText="width:40px;height:40px;font-size:20px";button.disabled=disabled;button.onclick=()=>setOpen(v=>!v);element.append(button);
  const control:IControl={onAdd:()=>element,onRemove:()=>element.remove()};map.addControl(control,"top-left");
  return()=>{if(map.hasControl(control))map.removeControl(control);};
 },[map,disabled,floating]);
 useEffect(()=>{
  if(!map||!showDrawing)return;
  if(!map.getSource("orion-measure")){map.addSource("orion-measure",{type:"geojson",data:empty});map.addLayer({id:"orion-measure-fill",source:"orion-measure",type:"fill",filter:["==",["geometry-type"],"Polygon"],paint:{"fill-color":"#fff6bb","fill-opacity":0.24}});map.addLayer({id:"orion-measure-line",source:"orion-measure",type:"line",paint:{"line-color":"#ffcf40","line-width":3}});}
  return()=>{try{for(const id of ["orion-measure-line","orion-measure-fill"])if(map.getLayer(id))map.removeLayer(id);if(map.getSource("orion-measure"))map.removeSource("orion-measure");}catch{/* Parent map may already be disposed. */}};
 },[map,showDrawing]);
 useEffect(()=>{
  if(!map||!editing)return;
  const releaseInteraction=lockMapToolInteraction(map);
  setMeasuringMap(map,true);map.getContainer().classList.add("orion-measuring");
  const click=(e:MapMouseEvent)=>{const s=latest.current;if(s.busy||s.drawing.points.length>=200||(e.originalEvent.target as HTMLElement)?.closest("button,[data-map-tool-ui],.maplibregl-control-container"))return;const p:MeasurePoint=[e.lngLat.lng,e.lngLat.lat];if(isMeasurePoint(p))s.change({...s.drawing,points:[...s.drawing.points,p]});};
  map.on("click",click);
  return()=>{map.off("click",click);setMeasuringMap(map,false);map.getContainer().classList.remove("orion-measuring");releaseInteraction();};
 },[map,editing]);
 useEffect(()=>{
  if(!map||!showDrawing)return;const features:GeoJSON.Feature[]=[];
  if(points.length>=2)features.push({type:"Feature",properties:{},geometry:drawing.kind==="polygon"&&points.length>=3?{type:"Polygon",coordinates:[[...points,points[0]]]}:{type:"LineString",coordinates:points}});
  (map.getSource("orion-measure") as GeoJSONSource|undefined)?.setData({type:"FeatureCollection",features});
  for(const id of ["orion-measure-fill","orion-measure-line"])if(map.getLayer(id))map.moveLayer(id);
 },[map,showDrawing,points,drawing.kind]);
 useEffect(()=>{
  if(!map||!showDrawing)return;const markers:Marker[]=[];
  function handle(p:MeasurePoint,index:number,midpoint:boolean){
   const element=document.createElement("button");element.type="button";element.className=midpoint?"orion-measure-midpoint":"orion-measure-vertex";
   element.setAttribute("aria-label",midpoint?`Inserir vértice após ${index+1}`:`Vértice de medição ${index+1}`);element.title=editing?(midpoint?"Toque ou arraste para inserir um vértice":"Arraste para ajustar; toque para selecionar"):"Ponto da medição concluída";
   const marker=new Marker({element,draggable:editing&&!busy}).setLngLat(p).addTo(map!);markers.push(marker);
   let dragged=false;
   const candidate=(point:MeasurePoint)=>{const next=[...latest.current.drawing.points];if(midpoint)next.splice(index+1,0,point);else next[index]=point;return next;};
   marker.on("dragstart",()=>{dragged=true;});
   marker.on("drag",()=>{const p=marker.getLngLat();setLive(candidate([p.lng,p.lat]));});
   marker.on("dragend",()=>{const p=marker.getLngLat();setLive(null);latest.current.change({...latest.current.drawing,points:candidate([p.lng,p.lat])});});
   element.addEventListener("click",e=>{e.stopPropagation();if(!editing||busy||dragged)return;if(midpoint)latest.current.change({...latest.current.drawing,points:candidate(p)});else setPicked(index);});
   element.addEventListener("keydown",e=>{if(!editing||busy)return;if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();e.stopPropagation();const xy=map!.project(marker.getLngLat()),step=e.shiftKey?10:1;if(e.key==="ArrowUp")xy.y-=step;if(e.key==="ArrowDown")xy.y+=step;if(e.key==="ArrowLeft")xy.x-=step;if(e.key==="ArrowRight")xy.x+=step;const p=map!.unproject(xy);latest.current.change({...latest.current.drawing,points:candidate([p.lng,p.lat])});}});
  }
  drawing.points.forEach((p,i)=>handle(p,i,false));
  if(editing&&drawing.points.length<200){const n=drawing.kind==="polygon"&&drawing.points.length>=3?drawing.points.length:drawing.points.length-1;for(let i=0;i<n;i++)handle(measureMidpoint(drawing.points[i],drawing.points[(i+1)%drawing.points.length]),i,true);}
  return()=>markers.forEach(m=>m.remove());
 },[map,showDrawing,drawing,busy,editing]);
 function undo(type:"undo"|"redo"){
  const next=type==="undo"?state.past.at(-1):state.future[0];
  if(next&&floating&&tool!=="slope")setTool(next.kind==="polygon"?"area":tool==="profile"?"profile":"distance");
  requestId.current=null;setFinished(false);setPicked(null);setMessage("");setDrawingError("");dispatch({type});
 }
 function fit(d:MeasureDrawing=drawing){if(!map||!d.points.length)return;const west=Math.min(...d.points.map(p=>p[0])),east=Math.max(...d.points.map(p=>p[0])),south=Math.min(...d.points.map(p=>p[1])),north=Math.max(...d.points.map(p=>p[1]));map.fitBounds([[west,south],[east,north]],{padding:55,maxZoom:20,duration:350});}
 async function save(){setBusy(true);try{requestId.current ||= crypto.randomUUID();const result=await saveMeasurement({id:requestId.current,name,survey_id:surveyId,measurement:{schema_version:1,...drawing}});setMessage(result.error||(surveyId?"Medição salva neste projeto. Versões anteriores preservadas.":"Medição salva na sua conta. Reabra em Medições salvas."));}catch{setMessage("Falha de conexão. O desenho permanece aqui; tente salvar novamente.");}finally{setBusy(false);}}
 async function load(){setBusy(true);try{const result=await listMeasurements(surveyId);setSaved(result.rows);setMessage(result.error);}catch{setMessage("Não foi possível carregar. Seu desenho foi mantido.");}finally{setBusy(false);}}
 function exportFile(){try{const value=measurementGeoJSON(name,requireMeasurement({schema_version:1,...drawing})),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/geo+json"})),a=document.createElement("a");a.href=url;a.download=(name.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,80)||"medicao")+".geojson";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){setMessage(e instanceof Error?e.message:"Revise a medição.");}}
 function selectTool(next:MapMeasureTool){
  if(busy||disabled)return;
  setOpen(true);setOptionsOpen(false);setTool(next);setFinished(false);setDetailsOpen(false);setPicked(null);setDrawingError("");
  if(next!=="slope"){const kind=next==="area"?"polygon":"path";if(drawing.kind!==kind)change({kind,points:[]});}
 }
 function editOnMap(){
  if(busy||disabled)return;
  setTool(drawing.kind==="polygon"?"area":tool==="profile"?"profile":"distance");
  setOpen(true);setOptionsOpen(false);setFinished(false);setPicked(null);setDrawingError("");
 }
 function finish(){
  if(!metrics.complete||busy||disabled)return;
  setFinished(true);setOptionsOpen(false);setPicked(null);
  if(tool==="profile")onTerrainAction?.("profile");
  if(tool==="area"&&terrainAvailable)onTerrainAction?.("area");
 }
 function showDetails(){
  setDetailsOpen(true);
  requestAnimationFrame(()=>{
   const terrain=map?.getContainer().parentElement?.parentElement?.querySelector('[data-testid="slope-inspector"]:not([hidden])');
   if((tool==="profile"||tool==="slope")&&terrain)terrain.scrollIntoView({behavior:"smooth",block:"start"});
   else detailsRef.current?.scrollIntoView({behavior:"smooth",block:"start"});
  });
 }
 const fmt=(v:number|null,unit:string)=>v===null?"— "+unit:v.toLocaleString("pt-BR",{maximumFractionDigits:2})+" "+unit;
 const quickDistance=fmt(points.length>=2?metrics.distance_m:null,"m");
 const quickArea=metrics.area_m2!==null&&metrics.area_m2>=10000?fmt(metrics.area_m2/10000,"ha"):fmt(metrics.area_m2,"m²");
 const primary=tool==="slope"?"Inclinação no ponto":tool==="area"?quickArea:quickDistance;
 const secondary=tool==="slope"?"Toque no terreno":tool==="area"?"Perímetro: "+fmt(metrics.perimeter_m,"m"):tool==="profile"?"Perfil · distância horizontal":"Distância horizontal";
 // Attach the live value to the geometry, keeping the last vertex free to drag.
 // Marker follows map navigation; the offset keeps the label inside the visible map.
 const labelTerrain=finished&&(tool==="area"||tool==="profile")&&terrainFeedback.state==="ready"
  ?terrainFeedback.title+(tool==="profile"&&terrainFeedback.detail?"\n"+terrainFeedback.detail:""):"";
 useEffect(()=>{
  if(!map||!floating||!showDrawing||points.length<2)return;
  const element=document.createElement("div");
  element.className="orion-measure-label";element.dataset.testid="map-measure-label";
  element.dataset.invalid=String(!!metrics.issue);
  const value=document.createElement("strong");
  value.textContent=tool==="area"?"Área: "+primary:tool==="profile"?"Perfil: "+primary:primary;
  element.append(value);
  if(tool==="area"||tool==="profile"){
   const detail=document.createElement("small");
   detail.textContent=tool==="area"?secondary:"Distância horizontal";element.append(detail);
  }
  if(tool==="area"&&points.length<3){
   const hint=document.createElement("small");hint.textContent="Adicione o terceiro ponto";element.append(hint);
  }
  if(labelTerrain){
   for(const [i,line] of labelTerrain.split("\n").entries()){
    const detail=document.createElement("small");detail.textContent=line;
    if(i===0)detail.className="measure-label-terrain";element.append(detail);
   }
  }
  const anchor=points[points.length-1];
  const marker=new Marker({element,anchor:"bottom",offset:[0,-20]}).setLngLat(anchor).addTo(map);
  const positionLabel=()=>{
   const xy=map.project(anchor),container=map.getContainer(),w=element.offsetWidth,h=element.offsetHeight;
   const half=w/2,margin=10;
   const targetX=Math.max(half+margin,Math.min(container.clientWidth-half-margin,xy.x));
   const offsetY=xy.y-h<64?h+20:-20;
   marker.setOffset([targetX-xy.x,offsetY]);
  };
  positionLabel();map.on("move",positionLabel);map.on("resize",positionLabel);
  return()=>{map.off("move",positionLabel);map.off("resize",positionLabel);marker.remove();};
 },[map,floating,showDrawing,points,tool,primary,secondary,labelTerrain,metrics.issue]);
 const host=map?.getContainer().parentElement;
 return <section className="orion-measurement" data-testid="measurement-tool" data-open={open?"true":"false"} data-editing={editing} data-tool={tool}>
  {!floating&&<button type="button" className="measure-launch" disabled={!map||disabled} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>📏 {open?"Fechar medição":"Medir no mapa"}<span>Distância · área · perímetro</span></button>}
  {floating&&host&&createPortal(<MapMeasureToolbar open={open} optionsOpen={optionsOpen} onToggleOptions={()=>setOptionsOpen(v=>!v)} tool={tool} finished={finished} points={points.length} valid={metrics.complete} busy={busy||disabled} terrainAvailable={terrainAvailable} primary={primary} secondary={secondary} issue={tool!=="slope"?(drawingError||metrics.issue):undefined} feedback={terrainFeedback}
   canUndo={tool==="slope"?terrainFeedback.canUndo:state.past.length>0} canRedo={tool==="slope"?terrainFeedback.canRedo:state.future.length>0} canClear={tool==="slope"?terrainFeedback.canClear:points.length>0}
   picked={editing&&picked!==null&&picked<drawing.points.length?picked:null} onRemovePoint={()=>{if(picked!==null&&!busy)change({...drawing,points:drawing.points.filter((_,i)=>i!==picked)});}}
   onOpen={()=>{if(!busy&&!disabled){setOpen(true);setOptionsOpen(true);}}} onClose={()=>{setOpen(false);setOptionsOpen(false);setPicked(null);}} onTool={selectTool}
   onUndo={()=>tool==="slope"?onTerrainAction?.("undo"):undo("undo")} onRedo={()=>tool==="slope"?onTerrainAction?.("redo"):undo("redo")} onClear={()=>tool==="slope"?onTerrainAction?.("clear"):change({...drawing,points:[]})}
   onFinish={finish} onEdit={editOnMap} onFix={()=>onTerrainAction?.("fix")} onRetry={()=>onTerrainAction?.("retry")} onDetails={showDetails}/>,host)}
  {showPanel&&<div ref={detailsRef} className="measure-sheet" data-testid="measurement-panel">
   <header><h3>{floating?"Resultado da medição":"Caminho ou polígono"}</h3>{floating?<button type="button" aria-label="Editar medição no mapa" disabled={busy||disabled} onClick={()=>{editOnMap();host?.scrollIntoView({behavior:"smooth",block:"center"});}}>↗</button>:<button type="button" aria-label="Fechar régua" disabled={busy} onClick={()=>setOpen(false)}>×</button>}</header>
   {!floating&&<div className="measure-modes"><button type="button" disabled={busy} aria-pressed={drawing.kind==="path"} onClick={()=>change({...drawing,kind:"path"})}>Caminho</button><button type="button" disabled={busy} aria-pressed={drawing.kind==="polygon"} onClick={()=>change({...drawing,kind:"polygon"})}>Polígono / área</button><button type="button" disabled={busy||!drawing.points.length} onClick={()=>fit()}>Enquadrar</button></div>}
   {!floating&&<InfoPopover title="Medição no mapa"><p className="measure-help">Toque no mapa para adicionar pontos. Arraste os círculos brancos para ajustar; os menores inserem novos vértices. {drawing.points.length}/200 pontos.</p></InfoPopover>}
   <div className="measure-values" aria-live="polite">
    {drawing.kind==="polygon"&&<label>Área<strong data-testid="measurement-area">{measureNumber(metrics.area_m2,areaUnits[areaUnit].factor)} <small>{areaUnits[areaUnit].label}</small></strong><select aria-label="Unidade de área" value={areaUnit} onChange={e=>setAreaUnit(e.target.value as AreaUnit)}>{Object.entries(areaUnits).map(([key,u])=><option key={key} value={key}>{u.label}</option>)}</select></label>}
    <label>{drawing.kind==="path"?"Comprimento":"Perímetro"}<strong data-testid="measurement-distance">{measureNumber(drawing.kind==="path"?(drawing.points.length>=2?metrics.distance_m:null):metrics.perimeter_m,distanceUnits[distanceUnit].factor)} <small>{distanceUnits[distanceUnit].label}</small></strong><select aria-label="Unidade de distância" value={distanceUnit} onChange={e=>setDistanceUnit(e.target.value as DistanceUnit)}>{Object.entries(distanceUnits).map(([key,u])=><option key={key} value={key}>{u.label}</option>)}</select></label>
   </div>
   {!floating&&<div className="measure-edit"><button type="button" aria-label="Desfazer medição" disabled={busy||!state.past.length} onClick={()=>undo("undo")}>↶ Desfazer</button><button type="button" aria-label="Refazer medição" disabled={busy||!state.future.length} onClick={()=>undo("redo")}>↷ Refazer</button><button type="button" disabled={busy||!drawing.points.length} onClick={()=>change({...drawing,points:[]})}>Limpar desenho</button>{picked!==null&&picked<drawing.points.length&&<button type="button" disabled={busy} onClick={()=>change({...drawing,points:drawing.points.filter((_,i)=>i!==picked)})}>Remover vértice {picked+1}</button>}</div>}
   {metrics.issue&&<p role="alert" className="measure-warning">{metrics.issue}</p>}
   {!embedded&&<>
   <label className="measure-name">Nome da medição<input aria-label="Nome da medição" value={name} maxLength={120} disabled={busy} onChange={e=>{setName(e.target.value);requestId.current=null;}}/></label>
   <div className="measure-edit"><button type="button" className="measure-save" disabled={busy||!metrics.complete||!name.trim()} onClick={()=>void save()}>{busy?"Aguarde…":surveyId?"Salvar no projeto":"Salvar na minha conta"}</button><button type="button" disabled={busy} onClick={()=>void load()}>Medições salvas</button><button type="button" disabled={!metrics.complete||busy} onClick={exportFile}>Exportar GeoJSON</button></div>
   {message&&<p role="status" className="measure-warning">{message}</p>}
   {saved!==null&&<div className="measure-saved"><header><strong>Medições salvas · últimas 100</strong><button type="button" aria-label="Fechar medições salvas" onClick={()=>setSaved(null)}>×</button></header>{saved.length?saved.map(row=><button type="button" key={row.id} disabled={busy} onClick={()=>{if(drawing.points.length&&!window.confirm("Abrir a medição salva? O desenho atual ficará disponível em Desfazer."))return;change(row.measurement);setTool(row.measurement.kind==="polygon"?"area":"distance");setOpen(true);setDetailsOpen(false);setName(row.name);setSaved(null);fit(row.measurement);if(floating)host?.scrollIntoView({behavior:"smooth",block:"center"});setMessage("Medição aberta. Alterações serão salvas como uma nova versão.");}}>{row.name}<small>{row.measurement.kind==="polygon"?"Polígono":"Caminho"} · {new Date(row.created_at).toLocaleString("pt-BR")}</small></button>):<p>Nenhuma medição salva nesta seleção.</p>}</div>}
   </>}
   {embedded&&<div className="measure-edit"><button type="button" disabled={!metrics.complete} onClick={exportFile}>Exportar GeoJSON</button></div>}
   <InfoPopover title="Medição no mapa"><p className="measure-disclaimer">Medidas horizontais no elipsoide WGS84. Não incluem relevo, altura, área de superfície ou precisão de levantamento. A posição depende da imagem e dos pontos marcados; casas decimais não garantem precisão centimétrica. A régua não altera o plano de voo nem o processamento.</p></InfoPopover>
  </div>}
 </section>;
}

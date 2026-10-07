"use client";
import {useId,useRef,type SyntheticEvent} from "react";
import type {MapMeasureTool,TerrainToolFeedback} from "@/lib/map-toolbox";
import "./map-measure-toolbar.css";

type IconName=MapMeasureTool|"ruler"|"undo"|"redo"|"clear"|"close"|"check"|"edit"|"chevron";
export function MeasureIcon({name}:{name:IconName}){
 const paths:Record<IconName,string>={ruler:"M3 17 17 3l4 4L7 21z M7 13l3 3 M11 9l3 3 M15 5l3 3",distance:"M4 17 10 6l10 10 M2 15h4v4H2z M8 4h4v4H8z M18 14h4v4h-4z",area:"M4 7 15 3l6 12-12 6-6-8z",profile:"M3 3v18h18 M5 16l5-7 4 4 6-8",slope:"M5 19 19 5 M6 5h.01 M18 19h.01",undo:"M9 5 3 10l6 5 M4 10h10a6 6 0 0 1 0 12",redo:"m15 5 6 5-6 5 M20 10H10a6 6 0 0 0 0 12",clear:"M4 7h16 M9 7V3h6v4 M6 7l1 14h10l1-14 M10 11v6 M14 11v6",close:"m6 6 12 12 M6 18 18 6",check:"m4 12 5 5L20 6",edit:"m4 16 12-12 4 4L8 20H4z M14 6l4 4",chevron:"m6 9 6 6 6-6"};
 return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={name==="slope"?2.7:1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/>{name==="slope"&&<><circle cx="6" cy="5" r="2.1"/><circle cx="18" cy="19" r="2.1"/></>}</svg>;
}
type Props={
 open:boolean;optionsOpen:boolean;tool:MapMeasureTool;finished:boolean;points:number;picked:number|null;valid:boolean;busy:boolean;
 canUndo:boolean;canRedo:boolean;canClear:boolean;terrainAvailable:boolean;
 primary:string;secondary:string;issue?:string;feedback:TerrainToolFeedback;
 onOpen:()=>void;onClose:()=>void;onToggleOptions:()=>void;onTool:(tool:MapMeasureTool)=>void;
 onUndo:()=>void;onRedo:()=>void;onClear:()=>void;onFinish:()=>void;onEdit:()=>void;onRemovePoint:()=>void;
 onFix:()=>void;onRetry:()=>void;onDetails:()=>void;
};
const tools:[MapMeasureTool,string,string][]=[["distance","Distância","Medir distância"],["area","Área","Medir área"],["profile","Perfil","Medir perfil de elevação"],["slope","Inclinação %","Consultar inclinação em porcentagem"]];
function stopMapGesture(event:SyntheticEvent){event.stopPropagation();}

export default function MapMeasureToolbar(p:Props){
 const optionsId=useId(),toggleRef=useRef<HTMLButtonElement>(null);
 const terrain=p.tool==="slope"||(p.finished&&(p.tool==="profile"||p.tool==="area"));
 const info=terrain&&p.feedback.title?p.feedback:null;
 const currentLabel=tools.find(([tool])=>tool===p.tool)![1];
 const toggleLabel=!p.open?"Abrir ferramentas de medição":p.optionsOpen?"Recolher opções de medição":"Mostrar opções de medição";
 const notice=p.issue||(info?.state==="busy"||info?.state==="error"?info.title:"");
 const restoreFocus=()=>toggleRef.current?.focus({preventScroll:true});
 return <div className="orion-map-tools" data-map-tool-ui="true" data-testid="map-measure-toolbar" data-open={p.open} data-options-open={p.open&&p.optionsOpen} data-tool={p.tool} data-phase={!p.open?"closed":p.finished?"complete":p.tool==="slope"?"consulting":"drawing"} onPointerDown={stopMapGesture} onPointerUp={stopMapGesture} onPointerMove={stopMapGesture} onPointerCancel={stopMapGesture} onMouseDown={stopMapGesture} onMouseUp={stopMapGesture} onMouseMove={stopMapGesture} onTouchStart={stopMapGesture} onTouchMove={stopMapGesture} onTouchEnd={stopMapGesture} onTouchCancel={stopMapGesture} onDoubleClick={stopMapGesture} onClick={stopMapGesture} onWheel={stopMapGesture} onKeyUp={stopMapGesture} onKeyDown={e=>{
  e.stopPropagation();
  if(e.key==="Escape"){e.preventDefault();if(p.optionsOpen)p.onToggleOptions();else p.onClose();restoreFocus();}
 }}>
  <div className="map-tools-bar" role="group" aria-label="Medição no mapa" data-active={p.open}>
   <button ref={toggleRef} type="button" className="map-tools-toggle" disabled={p.busy} aria-expanded={p.open&&p.optionsOpen} aria-controls={optionsId} aria-label={toggleLabel} title={p.open?currentLabel+" · opções":"Medir no mapa"} onClick={p.open?p.onToggleOptions:p.onOpen}>
    <MeasureIcon name={p.open?p.tool:"ruler"}/><span>{p.open?currentLabel:"Medir"}</span>{p.open&&<i className="map-tools-chevron"><MeasureIcon name="chevron"/></i>}
   </button>
   {p.open&&<>
    {p.tool==="slope"?<button type="button" className="map-tools-confirm" onClick={p.onFix} disabled={p.busy||!p.feedback.canFix||p.feedback.state==="busy"} title="Fixar ponto de inclinação">Fixar ponto</button>:<button type="button" className="map-tools-confirm" disabled={p.busy||(!p.finished&&!p.valid)} onClick={p.finished?p.onEdit:p.onFinish}><MeasureIcon name={p.finished?"edit":"check"}/><span>{p.finished?"Editar":"Concluir"}</span></button>}
    <button type="button" className="map-tools-close" onClick={p.onClose} aria-label="Fechar ferramentas de medição" title="Fechar sem apagar"><MeasureIcon name="close"/></button>
   </>}
  </div>
  {p.open&&p.optionsOpen&&<div id={optionsId} className="map-tools-panel" role="group" aria-label="Opções de medição">
   <div className="map-tools-modes" role="toolbar" aria-label="Tipos de medição">{tools.map(([tool,label,aria])=><button type="button" key={tool} aria-label={aria} aria-pressed={p.tool===tool} disabled={p.busy||((tool==="profile"||tool==="slope")&&!p.terrainAvailable)} onClick={()=>{p.onTool(tool);restoreFocus();}}><MeasureIcon name={tool}/><span>{label}</span></button>)}</div>
   <div className="map-tools-actions">
    <button type="button" aria-label="Desfazer ponto no mapa" title="Desfazer" disabled={!p.canUndo||p.busy} onClick={p.onUndo}><MeasureIcon name="undo"/><span>Desfazer</span></button>
    <button type="button" aria-label="Refazer ponto no mapa" title="Refazer" disabled={!p.canRedo||p.busy} onClick={p.onRedo}><MeasureIcon name="redo"/><span>Refazer</span></button>
    <button type="button" aria-label="Limpar medição no mapa" title="Limpar" disabled={!p.canClear||p.busy} onClick={p.onClear}><MeasureIcon name="clear"/><span>Limpar</span></button>
    <button type="button" onClick={p.onDetails} title="Abrir resultados detalhados">Resultados ↗</button>
   </div>
  </div>}
  {p.open&&p.tool!=="slope"&&!p.finished&&p.picked!==null&&p.picked>=0&&p.picked<p.points&&<div className="map-tools-selection"><span>Vértice {p.picked+1}</span><button type="button" aria-label={`Remover vértice ${p.picked+1} no mapa`} disabled={p.busy} onClick={p.onRemovePoint}>Remover vértice</button></div>}
  {p.open&&notice&&<div className="map-tools-notice" role={p.issue||info?.state==="error"?"alert":"status"}>{info?.state==="busy"&&<i className="map-tools-spinner"/>}<span>{notice}</span>{info?.state==="error"&&<button type="button" onClick={p.onRetry}>Tentar novamente</button>}</div>}
  {p.open&&<div className="map-tools-sr-only" role="status" aria-live="polite" data-testid="map-measure-readout">{p.primary}. {p.secondary}. {info?.title} {info?.detail} {p.issue}</div>}
 </div>;
}

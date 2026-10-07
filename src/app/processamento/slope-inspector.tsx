"use client";
import {useCallback,useEffect,useMemo,useReducer,useRef,useState} from "react";
import {Marker,type Map as LibreMap,type MapMouseEvent} from "maplibre-gl";
import {isMeasuringMap,lockMapToolInteraction} from "@/lib/measurement-map-state";
import {measureDrawing,type MeasureDrawing} from "@/lib/map-measurement";
import {analyseElevationProfile,analyseSlopePolygon,sampleTerrain,type ElevationProfileSummary,type TerrainGrid,type TerrainSample,type SlopeAreaSummary} from "@/lib/terrain-analysis";
import {loadTerrainModel} from "./geotiff-preview";
import {clearFreshProcessingUrl,freshProcessingUrl} from "@/lib/processing-fresh-url";
import {slopeAnalysisGeoJSON,slopeReportHtml} from "./slope-report";
import {EMPTY_TERRAIN_FEEDBACK,type MapMeasureTool,type TerrainToolCommand,type TerrainToolFeedback,type TerrainToolAction} from "@/lib/map-toolbox";
import "./slope-inspector.css";

type Source={id:string;job_id:string;survey_id:string;download_url:string|null;created_at:string};
type Selection={drawing:MeasureDrawing;name:string};
type Props={map:LibreMap|null;source:Source|null;slopeVisible:boolean;selection:Selection|null;measuring:boolean;onDrawArea:()=>void;onDrawProfile:()=>void;embedded?:boolean;mapTool?:MapMeasureTool|null;toolbarCommand?:TerrainToolCommand|null;onToolbarFeedback?:(state:TerrainToolFeedback)=>void};
type Mark=TerrainSample&{id:number};
type MarkHistory={marks:Mark[];past:Mark[][];future:Mark[][]};
type MarkAction={type:"add";mark:Mark}|{type:"remove";id:number}|{type:"clear"|"undo"|"redo"};
function markReducer(state:MarkHistory,action:MarkAction):MarkHistory{
  if(action.type==="undo")return state.past.length?{marks:state.past.at(-1)!,past:state.past.slice(0,-1),future:[state.marks,...state.future]}:state;
  if(action.type==="redo")return state.future.length?{marks:state.future[0],past:[...state.past,state.marks],future:state.future.slice(1)}:state;
  if(action.type==="add"&&(state.marks.length>=20||state.marks.some(m=>m.column===action.mark.column&&m.row===action.mark.row)))return state;
  const marks=action.type==="add"?[...state.marks,action.mark]:action.type==="remove"?state.marks.filter(m=>m.id!==action.id):[];
  if(marks.length===state.marks.length)return state;
  return {marks,past:[...state.past.slice(-49),state.marks],future:[]};
}
type TerrainProblem={message:string;kind:"grid"|"slope"|"area"|"profile"|"export";signature?:string};
type TerrainAnalysis={kind:"area"|"profile";signature:string;progress:number};
const number=(v:number|null,digits=1)=>v===null?"—":v.toLocaleString("pt-BR",{maximumFractionDigits:digits,minimumFractionDigits:digits});
const noDataText=(s:TerrainSample)=>s.status==="outside"?"Fora da cobertura do DTM.":s.status==="nodata"?"Sem elevação válida neste ponto.":"Sem vizinhança válida para calcular a inclinação. Não é 0%.";
function profileSvgPath(summary:ElevationProfileSummary){
  const valid=summary.profile.filter(p=>p.elevationM!==null);
  if(valid.length<2||summary.lengthM<=0)return "";
  const min=Math.min(...valid.map(p=>p.elevationM!)),max=Math.max(...valid.map(p=>p.elevationM!)),range=Math.max(.01,max-min);
  let path="",open=false;
  for(const p of summary.profile){
    if(p.elevationM===null){open=false;continue;}
    const x=8+284*p.distanceM/summary.lengthM,y=92-76*(p.elevationM-min)/range;
    path+=(open?" L ":" M ")+x.toFixed(1)+" "+y.toFixed(1);open=true;
  }
  return path;
}

export default function SlopeInspector({map,source,slopeVisible,selection,measuring,onDrawArea,onDrawProfile,embedded=false,mapTool=null,toolbarCommand,onToolbarFeedback}:Props){
  const [mode,setMode]=useState<"auto"|"on"|"off">("auto"),[grid,setGrid]=useState<TerrainGrid|null>(null);
  const [loading,setLoading]=useState(false),[problem,setProblem]=useState<TerrainProblem|null>(null);
  const [sample,setSample]=useState<TerrainSample|null>(null),[labels,setLabels]=useState(true);
  const [markHistory,dispatchMarks]=useReducer(markReducer,{marks:[],past:[],future:[]});
  const marks=markHistory.marks;
  const [area,setArea]=useState<{signature:string;summary:SlopeAreaSummary;computedAt:string}|null>(null);
  const [profile,setProfile]=useState<{signature:string;summary:ElevationProfileSummary;computedAt:string}|null>(null);
  const [analysis,setAnalysis]=useState<TerrainAnalysis|null>(null);
  const nextId=useRef(1),pending=useRef<{key:string;task:Promise<TerrainGrid>}|null>(null),alive=useRef(true),controller=useRef<AbortController|null>(null);
  const active=(embedded?mapTool==="slope":(mode==="on"||(mode==="auto"&&slopeVisible)))&&!measuring;
  const available=!!source;
  const signature=JSON.stringify([source?.id,selection?.drawing]);
  const currentAnalysis=analysis?.signature===signature?analysis:null;
  const analysing=currentAnalysis?.kind==="area",profiling=currentAnalysis?.kind==="profile";
  const progress=analysing?currentAnalysis!.progress:0,profileProgress=profiling?currentAnalysis!.progress:0;
  const currentProblem=problem&&(!problem.signature||problem.signature===signature)&&(!embedded||!mapTool||problem.kind==="grid"||problem.kind==="export"||problem.kind===mapTool)?problem:null;
  const error=currentProblem?.message||"";
  const currentArea=area?.signature===signature?area:null;
  const currentProfile=profile?.signature===signature?profile:null;
  const metrics=useMemo(()=>{try{return selection?measureDrawing(selection.drawing):null;}catch{return null;}},[selection]);
  const validPolygon=selection?.drawing.kind==="polygon"&&!!metrics?.complete;
  const validPath=selection?.drawing.kind==="path"&&!!metrics?.complete;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
  const ensureGrid=useCallback(async()=>{
    if(!source)throw Error("DTM indisponível neste processamento.");
    if(pending.current?.key===source.id)return pending.current.task;
    setLoading(true);setProblem(null);
    const task=freshProcessingUrl(source,"download").then(url=>loadTerrainModel(url));pending.current={key:source.id,task};
    try{const value=await task;if(alive.current&&pending.current?.task===task)setGrid(value);return value;}
    catch(e){if(pending.current?.task===task)pending.current=null;throw e;}
    finally{if(alive.current&&(!pending.current||pending.current.task===task))setLoading(false);}
  },[source]);
  useEffect(()=>{
    if(!active||!map||!available)return;let stopped=false;
    void ensureGrid().catch(e=>{if(!stopped)setProblem({kind:"grid",message:e instanceof Error?e.message:"Não foi possível ler o DTM."});});
    return()=>{stopped=true;};
  },[active,map,available,ensureGrid]);
  useEffect(()=>{
    if(!map||!active||!grid)return;
    const releaseInteraction=lockMapToolInteraction(map);
    const click=(event:MapMouseEvent)=>{
      if(isMeasuringMap(map)||(event.originalEvent.target as Element)?.closest("button,[data-map-tool-ui],.maplibregl-control-container"))return;
      try{setSample(sampleTerrain(grid,[event.lngLat.lng,event.lngLat.lat]));setProblem(null);}
      catch(e){setProblem({kind:"slope",message:e instanceof Error?e.message:"Coordenada indisponível."});}
    };
    map.on("click",click);
    return()=>{map.off("click",click);releaseInteraction();};
  },[map,active,grid]);
  useEffect(()=>{
    if(!map||!labels||measuring)return;
    const list:Marker[]=[];
    const draw=(point:TerrainSample,id:number|null)=>{
      const element=document.createElement("button");element.type="button";element.className="orion-slope-pin"+(id===null?" slope-current":"");
      const text=point.slopePct===null?"Sem dados":number(point.slopePct)+"%";
      element.textContent=(id===null?"":"P"+id+" · ")+text;
      element.setAttribute("aria-label",id===null?"Inclinação consultada: "+text:"Ponto de inclinação "+id+": "+text);
      element.title="Estimativa local do DTM. Toque para consultar.";
      element.addEventListener("click",e=>{e.stopPropagation();setSample(point);});
      list.push(new Marker({element,anchor:"bottom"}).setLngLat(point.cellCenter||point.position).addTo(map));
    };
    for(const mark of marks)draw(mark,mark.id);
    if(sample&&active&&!marks.some(m=>m.column===sample.column&&m.row===sample.row))draw(sample,null);
    return()=>list.forEach(m=>m.remove());
  },[map,labels,marks,sample,active,measuring]);
  useEffect(()=>()=>controller.current?.abort(),[signature]);
  async function analyse(){
    if(!validPolygon||!selection)return;
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const capturedSignature=signature,points=selection.drawing.points.map(p=>[...p] as [number,number]);
    setAnalysis({kind:"area",signature:capturedSignature,progress:0});setProblem(null);
    try{
      const model=await ensureGrid();abort.signal.throwIfAborted();
      const summary=await analyseSlopePolygon(model,points,{signal:abort.signal,onProgress:p=>{if(alive.current&&!abort.signal.aborted&&controller.current===abort)setAnalysis({kind:"area",signature:capturedSignature,progress:p});}});
      if(alive.current&&!abort.signal.aborted&&controller.current===abort)setArea({signature:capturedSignature,summary,computedAt:new Date().toISOString()});
    }catch(e){if(alive.current&&!abort.signal.aborted&&controller.current===abort)setProblem({kind:"area",signature:capturedSignature,message:e instanceof Error?e.message:"Não foi possível analisar a área."});}
    finally{if(alive.current&&controller.current===abort){controller.current=null;setAnalysis(null);}}
  }
  async function analyseProfile(){
    if(!validPath||!selection)return;
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const capturedSignature=signature,points=selection.drawing.points.map(p=>[...p] as [number,number]);
    setAnalysis({kind:"profile",signature:capturedSignature,progress:0});setProblem(null);
    try{
      const model=await ensureGrid();abort.signal.throwIfAborted();
      const summary=await analyseElevationProfile(model,points,{signal:abort.signal,onProgress:p=>{if(alive.current&&!abort.signal.aborted&&controller.current===abort)setAnalysis({kind:"profile",signature:capturedSignature,progress:p});}});
      if(alive.current&&!abort.signal.aborted&&controller.current===abort)setProfile({signature:capturedSignature,summary,computedAt:new Date().toISOString()});
    }catch(e){if(alive.current&&!abort.signal.aborted&&controller.current===abort)setProblem({kind:"profile",signature:capturedSignature,message:e instanceof Error?e.message:"Não foi possível gerar o perfil."});}
    finally{if(alive.current&&controller.current===abort){controller.current=null;setAnalysis(null);}}
  }
  function fixPoint(){
    if(!sample||sample.slopePct===null||marks.length>=20||marks.some(m=>m.column===sample.column&&m.row===sample.row))return;
    dispatchMarks({type:"add",mark:{...sample,id:nextId.current++}});setLabels(true);
  }
  function clearPoints(){dispatchMarks({type:"clear"});setSample(null);}
  function restorePoints(type:"undo"|"redo"){dispatchMarks({type});setSample(null);setLabels(true);}
  function snapshot(){
    if(!source)throw Error("Fonte indisponível.");
    return {source:{resultId:source.id,jobId:source.job_id,surveyId:source.survey_id,createdAt:source.created_at,crs:grid?.sourceCrs||null,resolutionM:grid?[grid.dx,grid.dy]:null},
      name:selection?.name||"Análise de inclinação",generatedAt:new Date().toISOString(),marks,
      area:currentArea?{...currentArea,polygon:selection!.drawing.points}:null,
      profile:currentProfile?{...currentProfile,path:selection!.drawing.points}:null};
  }
  function exportAnalysis(){
    try{const value=slopeAnalysisGeoJSON(snapshot()),href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/geo+json"}));
      const a=document.createElement("a");a.href=href;a.download="orion-inclinacao-"+(source?.job_id.slice(0,8)||"selecao")+".geojson";a.click();setTimeout(()=>URL.revokeObjectURL(href),30000);
    }catch(e){setProblem({kind:"export",message:e instanceof Error?e.message:"Falha ao exportar análise."});}
  }
  function report(){
    try{const html=slopeReportHtml(snapshot()),win=window.open("","_blank");if(!win)throw Error("Permita abrir a aba do relatório neste navegador.");
      win.opener=null;win.document.write(html);win.document.close();const button=win.document.getElementById("print-report");if(button)button.onclick=()=>win.print();
    }catch(e){setProblem({kind:"export",message:e instanceof Error?e.message:"Não foi possível abrir o relatório."});}
  }
  async function retryTerrain(){
    if(source){pending.current=null;clearFreshProcessingUrl(source.id);}
    if(mapTool==="profile"&&validPath){await analyseProfile();return;}
    if(mapTool==="area"&&validPolygon){await analyse();return;}
    try{await ensureGrid();if(alive.current)setProblem(null);}
    catch(e){if(alive.current)setProblem({kind:"grid",message:e instanceof Error?e.message:"Falha ao ler DTM."});}
  }
  const actions=useRef<Partial<Record<TerrainToolAction,()=>void|Promise<void>>>>({});
  const lastCommand=useRef(0);
  useEffect(()=>{actions.current={area:analyse,profile:analyseProfile,fix:fixPoint,clear:clearPoints,undo:()=>restorePoints("undo"),redo:()=>restorePoints("redo"),retry:retryTerrain};});
  useEffect(()=>{
    if(!toolbarCommand||toolbarCommand.sequence===lastCommand.current)return;
    lastCommand.current=toolbarCommand.sequence;
    void actions.current[toolbarCommand.action]?.();
  },[toolbarCommand]);
  const feedback=useMemo<TerrainToolFeedback>(()=>{
    const base={...EMPTY_TERRAIN_FEEDBACK,count:marks.length,canClear:marks.length>0||!!sample,
      canUndo:markHistory.past.length>0,canRedo:markHistory.future.length>0,
      canFix:!!sample&&sample.slopePct!==null&&marks.length<20&&!marks.some(m=>m.column===sample.column&&m.row===sample.row)};
    if(!mapTool)return base;
    if(loading||analysing||profiling)return {...base,state:"busy",title:loading?"Lendo DTM…":profiling?`Gerando perfil: ${number(profileProgress,0)}%`:`Analisando área: ${number(progress,0)}%`,detail:"O mapa permanece disponível."};
    if(error&&currentProblem?.kind!=="export")return {...base,state:"error",title:error,detail:"Tente novamente sem reiniciar o processamento."};
    if(mapTool==="slope")return {...base,state:grid?"ready":"idle",title:sample?(sample.slopePct===null?"Sem dados de inclinação":number(sample.slopePct)+"% de inclinação"):"Toque em um ponto do mapa",detail:sample?(sample.slopePct===null?noDataText(sample):"Elevação: "+number(sample.elevationM,2)+" m · DTM"):"Fixe pontos para comparar. Nenhuma foto será alterada."};
    if(mapTool==="profile"&&currentProfile)return {...base,state:"ready",title:"Perfil calculado",detail:"Mín. "+number(currentProfile.summary.minElevationM,2)+" m · máx. "+number(currentProfile.summary.maxElevationM,2)+" m"};
    if(mapTool==="area"&&currentArea)return {...base,state:"ready",title:"Inclinação média: "+number(currentArea.summary.meanPct)+"%",detail:"Cobertura válida: "+number(currentArea.summary.coveragePct)+"% · estimativa do DTM"};
    return base;
  },[mapTool,marks,markHistory.past.length,markHistory.future.length,sample,loading,analysing,profiling,profileProgress,progress,error,currentProblem?.kind,grid,currentArea,currentProfile]);
  useEffect(()=>{onToolbarFeedback?.(feedback);},[feedback,onToolbarFeedback]);
  const canExport=!!source&&(marks.length>0||!!currentArea||!!currentProfile);
  return <section hidden={embedded&&!sample&&!marks.length&&!area&&!profile&&!error&&!loading&&!analysing&&!profiling} className="slope-inspector" data-testid="slope-inspector" data-slope-state={loading?"loading":error?"error":grid?"ready":"idle"}>
    <header><div><span className="slope-eyebrow">ANÁLISE DO TERRENO</span><h3>{embedded?"Resultados do terreno":"Inclinação em %"}</h3></div><span className="slope-badge">DTM · estimativa</span></header>
    {!embedded&&<><div className="slope-actions">
      <button type="button" aria-pressed={active} disabled={!map||!available||measuring} onClick={()=>setMode(active?"off":"on")}>{active?"Toque no mapa: % ativo":"Consultar % no mapa"}</button>
      <button type="button" disabled={!map||!available} onClick={onDrawArea}>Desenhar área</button>
      <button type="button" disabled={!map||!available} onClick={onDrawProfile}>Perfil de elevação</button>
    </div>
    <p className="slope-help">{measuring?"Régua aberta: os toques desenham a área. Feche a medição para consultar pontos.":active?"Toque no terreno para consultar a inclinação local e a elevação. Fixe os pontos que deseja comparar.":"Ative a consulta para marcar a inclinação sobre a ortofoto ou qualquer camada."}</p></>}
    {loading&&<p role="status">Lendo DTM existente… A ortofoto permanece disponível.</p>}
    {!available&&<p role="status">Este resultado não tem DTM disponível para análise.</p>}
    {error&&<div role="alert" className="slope-warning">{error}{currentProblem?.kind!=="export"&&<button type="button" onClick={()=>void retryTerrain()}>Tentar novamente</button>}</div>}
    {sample&&<div className="slope-point" data-testid="slope-point" data-sample-status={sample.status} aria-live="polite">
      <div className="slope-values"><div><span>Inclinação local</span><strong data-testid="slope-point-value">{number(sample.slopePct)}{sample.slopePct!==null&&<small> %</small>}</strong></div><div><span>Elevação no DTM</span><strong>{number(sample.elevationM,2)}<small> m</small></strong></div></div>
      {sample.slopePct===null&&<p className="slope-warning">{noDataText(sample)}</p>}
      <p className="slope-coordinate">{number(sample.position[1],6)}, {number(sample.position[0],6)} · célula do DTM</p>
      {!embedded&&<button type="button" onClick={fixPoint} disabled={sample.slopePct===null||marks.length>=20||marks.some(m=>m.column===sample.column&&m.row===sample.row)}>Fixar este ponto</button>}
    </div>}
    {(marks.length>0||sample)&&<div className="slope-actions"><label><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/> Mostrar etiquetas ({marks.length}/20 fixadas)</label><button type="button" onClick={clearPoints}>Limpar marcações</button></div>}
    {marks.length>0&&<div className="slope-mark-list">{marks.map(m=><span key={m.id}><button type="button" onClick={()=>setSample(m)}>P{m.id} · {number(m.slopePct)}%</button><button type="button" aria-label={`Remover ponto de inclinação ${m.id}`} onClick={()=>{dispatchMarks({type:"remove",id:m.id});setSample(null);}}>×</button></span>)}</div>}
    {(!embedded||area)&&<div className="slope-area">
      <h4>Resumo da área desenhada</h4><p className="slope-help">{selection?.drawing.points.length?`${selection.name} · ${selection.drawing.points.length} vértices` : "Use Desenhar área e marque pelo menos três vértices."}</p>
      {metrics?.issue&&<p className="slope-warning">{metrics.issue}</p>}
      {!embedded&&<button type="button" disabled={!validPolygon||analysing||!available} onClick={()=>void analyse()}>{analysing?`Analisando células: ${number(progress,0)}%`:"Analisar inclinação da área"}</button>}
      {area&&!currentArea&&<p role="status" className="slope-warning">O contorno mudou. Analise novamente; o resumo anterior não se aplica à seleção atual.</p>}
      {currentArea&&<div data-testid="slope-area-result">
        <div className="slope-values slope-three"><div><span>Média válida</span><strong data-testid="slope-area-mean">{number(currentArea.summary.meanPct)}<small> %</small></strong></div><div><span>Mínima</span><strong>{number(currentArea.summary.minPct)}<small> %</small></strong></div><div><span>Máxima local</span><strong>{number(currentArea.summary.maxPct)}<small> %</small></strong></div></div>
        {!currentArea.summary.validCells&&<p role="status" className="slope-warning">Sem células com vizinhança válida nesta área. Não equivale a terreno plano.</p>}
        {currentArea.summary.maxPct!==null&&currentArea.summary.maxPct>100&&<p className="slope-warning">Há inclinações locais acima de 100% no DTM. Podem corresponder a transições abruptas ou ruídos do modelo; não representam a inclinação média do talhão. Revise os extremos antes de usá-los no planejamento.</p>}
        <p className="slope-coverage">Cobertura válida estimada: <strong data-testid="slope-coverage">{number(currentArea.summary.coveragePct)}%</strong> · {number(currentArea.summary.validAreaM2/10000,4)} ha analisados.</p>
        <p className="slope-help">Sem dados / fora da cobertura: aproximadamente {number(currentArea.summary.unavailableAreaM2/10000,4)} ha. As faixas abaixo consideram somente a parte válida.</p>
        <div className="slope-histogram">{currentArea.summary.classes.map(c=><div key={c.label}><span>{c.label}</span><div className="slope-bar"><i style={{width:`${c.validSharePct}%`,background:c.color}}/></div><strong>{number(c.areaM2/10000,4)} ha</strong><small>{number(c.validSharePct)}%</small></div>)}</div>
        <p className="slope-help">Áreas por contagem de células cujo centro está no polígono; bordas são aproximadas. Média e extremos não incluem pontos sem dados. Área horizontal, não área de superfície.</p>
      </div>}
    </div>}
    {(!embedded||profile)&&<div className="slope-area">
      <h4>Perfil de elevação</h4>
      <p className="slope-help">{selection?.drawing.kind==="path"&&selection.drawing.points.length?`${selection.name} · ${selection.drawing.points.length} vértices`:"Use Perfil de elevação e marque pelo menos dois pontos."}</p>
      {!embedded&&<button type="button" disabled={!validPath||profiling||!available} onClick={()=>void analyseProfile()}>{profiling?`Lendo perfil: ${number(profileProgress,0)}%`:"Gerar perfil distância × altitude"}</button>}
      {profile&&!currentProfile&&<p role="status" className="slope-warning">O caminho mudou. Gere novamente o perfil para esta geometria.</p>}
      {currentProfile&&<div data-testid="elevation-profile">
        <div className="slope-values slope-three">
          <div><span>Comprimento</span><strong>{number(currentProfile.summary.lengthM,1)}<small> m</small></strong></div>
          <div><span>Altitude mínima</span><strong>{number(currentProfile.summary.minElevationM,2)}<small> m</small></strong></div>
          <div><span>Altitude máxima</span><strong>{number(currentProfile.summary.maxElevationM,2)}<small> m</small></strong></div>
        </div>
        <div className="slope-values slope-three">
          <div><span>Ganho</span><strong>{number(currentProfile.summary.gainM,2)}<small> m</small></strong></div>
          <div><span>Perda</span><strong>{number(currentProfile.summary.lossM,2)}<small> m</small></strong></div>
          <div><span>Inclinação local média</span><strong>{number(currentProfile.summary.meanLocalSlopePct)}<small> %</small></strong></div>
        </div>
        <div className="profile-chart" aria-label="Gráfico do perfil de elevação">
          <svg viewBox="0 0 300 110" role="img" aria-label="Distância por altitude">
            <path d={profileSvgPath(currentProfile.summary)} fill="none" stroke="currentColor" strokeWidth="2"/>
            <line x1="8" y1="96" x2="292" y2="96" stroke="currentColor" opacity=".25"/>
          </svg>
          <div className="profile-axis"><span>0 m</span><span>{number(currentProfile.summary.lengthM,1)} m</span></div>
        </div>
        <p className="slope-coverage">Cobertura válida do perfil: <strong>{number(currentProfile.summary.coveragePct)}%</strong> · espaçamento de amostragem {number(currentProfile.summary.spacingM,2)} m.</p>
        <p className="slope-help">Ganho e perda somam diferenças entre amostras válidas consecutivas. Lacunas NoData não são interpoladas nem ligadas artificialmente.</p>
      </div>}
    </div>}
    <div className="slope-actions"><button type="button" disabled={!canExport} onClick={exportAnalysis}>Baixar análise GeoJSON</button><button type="button" disabled={!canExport} onClick={report}>Relatório da seleção / PDF</button></div>
    <p className="slope-disclaimer">{grid?`Grade ${number(grid.dx,2)} × ${number(grid.dy,2)} m · `:""}Inclinação local de maior declive, calculada em vizinhança 3×3 do DTM. Não é uma medição entre dois pontos nem uma precisão certificada. Ruídos e falhas do modelo podem afetar os extremos. Não valida segurança de máquinas ou aptidão para plantio. Marcações ficam nesta sessão; exporte para guardar. A régua permite salvar o contorno na conta.</p>
  </section>;
}

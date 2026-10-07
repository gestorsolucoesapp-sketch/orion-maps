"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Marker,type Map as LibreMap,type MapMouseEvent} from "maplibre-gl";
import {isMeasuringMap} from "@/lib/measurement-map-state";
import {measureDrawing,type MeasureDrawing} from "@/lib/map-measurement";
import {analyseSlopePolygon,sampleTerrain,type TerrainGrid,type TerrainSample,type SlopeAreaSummary} from "@/lib/terrain-analysis";
import {loadTerrainModel} from "./geotiff-preview";
import {clearFreshProcessingUrl,freshProcessingUrl} from "@/lib/processing-fresh-url";
import {slopeAnalysisGeoJSON,slopeReportHtml} from "./slope-report";
import "./slope-inspector.css";

type Source={id:string;job_id:string;survey_id:string;download_url:string|null;created_at:string};
type Selection={drawing:MeasureDrawing;name:string};
type Props={map:LibreMap|null;source:Source|null;slopeVisible:boolean;selection:Selection|null;measuring:boolean;onDrawArea:()=>void};
type Mark=TerrainSample&{id:number};
const number=(v:number|null,digits=1)=>v===null?"—":v.toLocaleString("pt-BR",{maximumFractionDigits:digits,minimumFractionDigits:digits});
const noDataText=(s:TerrainSample)=>s.status==="outside"?"Fora da cobertura do DTM.":s.status==="nodata"?"Sem elevação válida neste ponto.":"Sem vizinhança válida para calcular a inclinação. Não é 0%.";

export default function SlopeInspector({map,source,slopeVisible,selection,measuring,onDrawArea}:Props){
  const [mode,setMode]=useState<"auto"|"on"|"off">("auto"),[grid,setGrid]=useState<TerrainGrid|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState("");
  const [sample,setSample]=useState<TerrainSample|null>(null),[marks,setMarks]=useState<Mark[]>([]),[labels,setLabels]=useState(true);
  const [area,setArea]=useState<{signature:string;summary:SlopeAreaSummary;computedAt:string}|null>(null),[analysing,setAnalysing]=useState(false),[progress,setProgress]=useState(0);
  const nextId=useRef(1),pending=useRef<{key:string;task:Promise<TerrainGrid>}|null>(null),alive=useRef(true),controller=useRef<AbortController|null>(null);
  const active=(mode==="on"||(mode==="auto"&&slopeVisible))&&!measuring;
  const available=!!source;
  const signature=JSON.stringify([source?.id,selection?.drawing]);
  const currentArea=area?.signature===signature?area:null;
  const metrics=useMemo(()=>{try{return selection?measureDrawing(selection.drawing):null;}catch{return null;}},[selection]);
  const validPolygon=selection?.drawing.kind==="polygon"&&!!metrics?.complete;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
  const ensureGrid=useCallback(async()=>{
    if(!source)throw Error("DTM indisponível neste processamento.");
    if(pending.current?.key===source.id)return pending.current.task;
    setLoading(true);setError("");
    const task=freshProcessingUrl(source,"download").then(url=>loadTerrainModel(url));pending.current={key:source.id,task};
    try{const value=await task;if(alive.current)setGrid(value);return value;}
    catch(e){if(pending.current?.task===task)pending.current=null;throw e;}
    finally{if(alive.current)setLoading(false);}
  },[source]);
  useEffect(()=>{
    if(!active||!map||!available)return;let stopped=false;
    void ensureGrid().catch(e=>{if(!stopped)setError(e instanceof Error?e.message:"Não foi possível ler o DTM.");});
    return()=>{stopped=true;};
  },[active,map,available,ensureGrid]);
  useEffect(()=>{
    if(!map||!active||!grid)return;
    const previous=map.getCanvas().style.cursor;map.getCanvas().style.cursor="crosshair";
    const click=(event:MapMouseEvent)=>{
      if(isMeasuringMap(map)||(event.originalEvent.target as HTMLElement)?.closest("button,.maplibregl-control-container"))return;
      try{setSample(sampleTerrain(grid,[event.lngLat.lng,event.lngLat.lat]));setError("");}
      catch(e){setError(e instanceof Error?e.message:"Coordenada indisponível.");}
    };
    map.on("click",click);
    return()=>{map.off("click",click);if(!isMeasuringMap(map))map.getCanvas().style.cursor=previous;};
  },[map,active,grid]);
  useEffect(()=>{
    if(!map||!labels)return;
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
    if(sample&&!marks.some(m=>m.column===sample.column&&m.row===sample.row))draw(sample,null);
    return()=>list.forEach(m=>m.remove());
  },[map,labels,marks,sample]);
  useEffect(()=>()=>controller.current?.abort(),[signature]);
  async function analyse(){
    if(!validPolygon||!selection)return;
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const capturedSignature=signature,points=selection.drawing.points.map(p=>[...p] as [number,number]);
    setAnalysing(true);setProgress(0);setError("");
    try{
      const model=await ensureGrid();abort.signal.throwIfAborted();
      const summary=await analyseSlopePolygon(model,points,{signal:abort.signal,onProgress:p=>{if(alive.current&&!abort.signal.aborted)setProgress(p);}});
      if(alive.current&&!abort.signal.aborted)setArea({signature:capturedSignature,summary,computedAt:new Date().toISOString()});
    }catch(e){if(alive.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:"Não foi possível analisar a área.");}
    finally{if(alive.current&&controller.current===abort)setAnalysing(false);}
  }
  function fixPoint(){
    if(!sample||sample.slopePct===null||marks.length>=20||marks.some(m=>m.column===sample.column&&m.row===sample.row))return;
    setMarks(old=>[...old,{...sample,id:nextId.current++}]);setLabels(true);
  }
  function snapshot(){
    if(!source)throw Error("Fonte indisponível.");
    return {source:{resultId:source.id,jobId:source.job_id,surveyId:source.survey_id,createdAt:source.created_at,crs:grid?.sourceCrs||null,resolutionM:grid?[grid.dx,grid.dy]:null},
      name:selection?.name||"Análise de inclinação",generatedAt:new Date().toISOString(),marks,
      area:currentArea?{...currentArea,polygon:selection!.drawing.points}:null};
  }
  function exportAnalysis(){
    try{const value=slopeAnalysisGeoJSON(snapshot()),href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/geo+json"}));
      const a=document.createElement("a");a.href=href;a.download="orion-inclinacao-"+(source?.job_id.slice(0,8)||"selecao")+".geojson";a.click();setTimeout(()=>URL.revokeObjectURL(href),30000);
    }catch(e){setError(e instanceof Error?e.message:"Falha ao exportar análise.");}
  }
  function report(){
    try{const html=slopeReportHtml(snapshot()),win=window.open("","_blank");if(!win)throw Error("Permita abrir a aba do relatório neste navegador.");
      win.opener=null;win.document.write(html);win.document.close();const button=win.document.getElementById("print-report");if(button)button.onclick=()=>win.print();
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível abrir o relatório.");}
  }
  const canExport=!!source&&(marks.length>0||!!currentArea);
  return <section className="slope-inspector" data-testid="slope-inspector" data-slope-state={loading?"loading":error?"error":grid?"ready":"idle"}>
    <header><div><span className="slope-eyebrow">ANÁLISE DO TERRENO</span><h3>Inclinação em %</h3></div><span className="slope-badge">DTM · estimativa</span></header>
    <div className="slope-actions">
      <button type="button" aria-pressed={active} disabled={!map||!available||measuring} onClick={()=>setMode(active?"off":"on")}>{active?"Toque no mapa: % ativo":"Consultar % no mapa"}</button>
      <button type="button" disabled={!map||!available} onClick={onDrawArea}>Desenhar área</button>
    </div>
    <p className="slope-help">{measuring?"Régua aberta: os toques desenham a área. Feche a medição para consultar pontos.":active?"Toque no terreno para consultar a inclinação local e a elevação. Fixe os pontos que deseja comparar.":"Ative a consulta para marcar a inclinação sobre a ortofoto ou qualquer camada."}</p>
    {loading&&<p role="status">Lendo DTM existente… A ortofoto permanece disponível.</p>}
    {!available&&<p role="status">Este resultado não tem DTM disponível para análise.</p>}
    {error&&<div role="alert" className="slope-warning">{error}<button type="button" onClick={()=>{if(source){pending.current=null;clearFreshProcessingUrl(source.id);}void ensureGrid().then(()=>setError("")).catch(e=>setError(e instanceof Error?e.message:"Falha ao ler DTM."));}}>Tentar ler DTM novamente</button></div>}
    {sample&&<div className="slope-point" data-testid="slope-point" data-sample-status={sample.status} aria-live="polite">
      <div className="slope-values"><div><span>Inclinação local</span><strong data-testid="slope-point-value">{number(sample.slopePct)}{sample.slopePct!==null&&<small> %</small>}</strong></div><div><span>Elevação no DTM</span><strong>{number(sample.elevationM,2)}<small> m</small></strong></div></div>
      {sample.slopePct===null&&<p className="slope-warning">{noDataText(sample)}</p>}
      <p className="slope-coordinate">{number(sample.position[1],6)}, {number(sample.position[0],6)} · célula do DTM</p>
      <button type="button" onClick={fixPoint} disabled={sample.slopePct===null||marks.length>=20||marks.some(m=>m.column===sample.column&&m.row===sample.row)}>Fixar este ponto</button>
    </div>}
    {(marks.length>0||sample)&&<div className="slope-actions"><label><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/> Mostrar etiquetas ({marks.length}/20 fixadas)</label><button type="button" onClick={()=>{setMarks([]);setSample(null);}}>Limpar marcações</button></div>}
    {marks.length>0&&<div className="slope-mark-list">{marks.map(m=><span key={m.id}><button type="button" onClick={()=>setSample(m)}>P{m.id} · {number(m.slopePct)}%</button><button type="button" aria-label={`Remover ponto de inclinação ${m.id}`} onClick={()=>setMarks(old=>old.filter(p=>p.id!==m.id))}>×</button></span>)}</div>}
    <div className="slope-area">
      <h4>Resumo da área desenhada</h4><p className="slope-help">{selection?.drawing.points.length?`${selection.name} · ${selection.drawing.points.length} vértices` : "Use Desenhar área e marque pelo menos três vértices."}</p>
      {metrics?.issue&&<p className="slope-warning">{metrics.issue}</p>}
      <button type="button" disabled={!validPolygon||analysing||!available} onClick={()=>void analyse()}>{analysing?`Analisando células: ${number(progress,0)}%`:"Analisar inclinação da área"}</button>
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
    </div>
    <div className="slope-actions"><button type="button" disabled={!canExport} onClick={exportAnalysis}>Baixar análise GeoJSON</button><button type="button" disabled={!canExport} onClick={report}>Relatório da seleção / PDF</button></div>
    <p className="slope-disclaimer">{grid?`Grade ${number(grid.dx,2)} × ${number(grid.dy,2)} m · `:""}Inclinação local de maior declive, calculada em vizinhança 3×3 do DTM. Não é uma medição entre dois pontos nem uma precisão certificada. Ruídos e falhas do modelo podem afetar os extremos. Não valida segurança de máquinas ou aptidão para plantio. Marcações ficam nesta sessão; exporte para guardar. A régua permite salvar o contorno na conta.</p>
  </section>;
}

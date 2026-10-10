"use client";

import {useEffect,useRef,useState} from "react";
import type {Coordinate} from "@/lib/flight-plan";
import {previewTerrainFlight,type TerrainFlightPreview} from "@/lib/terrain-flight-preview";
import type {TerrainGrid} from "@/lib/terrain-analysis";
import {loadTerrainModelFromBlob} from "@/app/processamento/geotiff-preview";

type Props={route:Coordinate[];home:Coordinate|null;height:number;onClose:()=>void};
const fmt=(value:number,digits=1)=>value.toLocaleString("pt-BR",{maximumFractionDigits:digits});

function Profile({data,height}:{data:TerrainFlightPreview;height:number}){
 const width=780,chartHeight=180,padding=24;
 const bottom=Math.min(data.minGroundM,data.homeGroundM),top=Math.max(data.maxGroundM,data.homeGroundM+data.maxRelativeHeightM);
 const range=Math.max(1,top-bottom),x=(distance:number)=>padding+(width-padding*2)*distance/data.distanceM,y=(elevation:number)=>chartHeight-padding-(chartHeight-padding*2)*(elevation-bottom)/range;
 const ground=data.points.map((p,i)=>`${i?"L":"M"}${x(p.distanceM).toFixed(1)},${y(p.groundM).toFixed(1)}`).join(" ");
 const flight=data.points.map((p,i)=>`${i?"L":"M"}${x(p.distanceM).toFixed(1)},${y(data.homeGroundM+p.relativeHeightM).toFixed(1)}`).join(" ");
 return <figure className="terrain-flight-chart"><svg viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-label="Perfil do terreno e altura planejada ao longo da rota"><path d={ground} fill="none" stroke="#a2672b" strokeWidth="3"/><path d={flight} fill="none" stroke="#087f63" strokeWidth="3"/></svg><figcaption><span><i className="terrain-ground-line"/>Relevo do DTM</span><span><i className="terrain-flight-line"/>Proposta · {fmt(height,0)} m acima do terreno</span></figcaption></figure>;
}

export default function TerrainFlightPlanner({route,home,height,onClose}:Props){
 const [model,setModel]=useState<{name:string;grid:TerrainGrid}|null>(null),[calculated,setCalculated]=useState<{key:string;data:TerrainFlightPreview}|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const loadSequence=useRef(0);
 const key=JSON.stringify([model?.name,route,home,height]);
 const result=calculated?.key===key?calculated.data:null;
 async function openFile(file:File){
  const sequence=++loadSequence.current;setBusy(true);setModel(null);setCalculated(null);setMessage("Lendo DTM…");
  try{
   if(!/\.tiff?$/i.test(file.name))throw Error("Escolha um DTM GeoTIFF (.tif ou .tiff).");
   const grid=await loadTerrainModelFromBlob(file);
   if(sequence!==loadSequence.current)return;
   setModel({name:file.name,grid});setMessage("DTM carregado. Conferindo decolagem e rota…");
  }catch(error){if(sequence===loadSequence.current)setMessage(error instanceof Error?error.message:"Não foi possível ler o DTM.");}
  finally{if(sequence===loadSequence.current)setBusy(false);}
 }
 useEffect(()=>{
  if(!model||!home||route.length<2){return;}
  let active=true;
  previewTerrainFlight(model.grid,route,home,height).then(data=>{if(active){setCalculated({key,data});setMessage(data.complete?"Prévia calculada; revise o perfil e o modelo antes de qualquer voo.":`Prévia incompleta: ${data.missingSamples} amostras da rota estão fora do DTM ou sem dados.`);}}).catch(error=>{if(active){setCalculated(null);setMessage(error instanceof Error?error.message:"Falha na análise do relevo.");}});
  return()=>{active=false;};
 },[model,route,home,height,key]);
 const valid=result?.complete&&result.minRelativeHeightM>=1&&result.maxRelativeHeightM<=500;
 return <section id="terrain-flight-planner" className="terrain-flight-planner" aria-labelledby="terrain-flight-title"><div className="terrain-flight-heading"><div><span>ANÁLISE DO TERRENO</span><h2 id="terrain-flight-title">Altura ao longo da rota</h2></div><div className="terrain-flight-heading-actions"><strong>PRÉVIA · SEM ENVIO</strong><button type="button" onClick={onClose}>Fechar análise</button></div></div>
  <p>Importe um DTM GeoTIFF da área. O Orion compara o relevo de cada trecho com o ponto H e calcula uma proposta de altura para manter {fmt(height,0)} m sobre o terreno.</p>
  <label className="terrain-flight-file">DTM GeoTIFF (.tif/.tiff)<input type="file" accept=".tif,.tiff,image/tiff" onChange={event=>{const file=event.target.files?.[0];if(file)void openFile(file);event.target.value="";}}/></label>
  {model&&<p><b>Modelo:</b> {model.name} · {model.grid.sourceCrs} · resolução {fmt(model.grid.dx)} × {fmt(model.grid.dy)} m</p>}
  {!home&&<p role="status">Marque o H no mapa no local real de decolagem para calcular a altura relativa.</p>}
  {route.length<2&&<p role="status">Gere uma rota com pelo menos dois pontos para ver o perfil.</p>}
  {message&&<p role="status" className="terrain-flight-message">{busy?"Lendo DTM…":message}</p>}
  {result&&<><div className="terrain-flight-metrics"><div><span>Terreno no H</span><b>{fmt(result.homeGroundM)} m</b></div><div><span>Variação do terreno</span><b>{fmt(result.minGroundM)}–{fmt(result.maxGroundM)} m</b></div><div><span>Altura relativa proposta</span><b>{fmt(result.minRelativeHeightM)}–{fmt(result.maxRelativeHeightM)} m</b></div><div><span>Amostragem da rota</span><b>até {fmt(result.spacingM)} m</b></div></div>{result.complete&&<Profile data={result} height={height}/>}<p className={valid?"terrain-flight-note":"terrain-flight-warning"}>{valid?"O DTM cobre as amostras calculadas. Esta prévia não comprova distância segura ao solo entre amostras ou nas curvas.":"Prévia incompleta ou altura fora dos limites do editor. Não use esta proposta como missão."}</p></>}
  <p className="terrain-flight-warning">O DTM pode não mostrar árvores, fios e construções; confirme a origem, data e referência vertical. O DJI Fly pode arredondar a trajetória entre waypoints. Esta prévia não altera o arquivo do controle. O envio ao RC 2 fica bloqueado enquanto a análise estiver aberta; ao fechá-la, a missão disponível volta a ser a de altura fixa relativa à decolagem.</p>
 </section>;
}

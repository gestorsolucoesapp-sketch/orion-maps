"use client";
import InfoPopover from "@/components/info-popover";

import {useEffect,useMemo,useRef,useState} from "react";
import type {Coordinate} from "@/lib/flight-plan";
import type {CaptureMode} from "@/lib/photo-mission";
import {advanceSimulation,buildFlightSimulation,flightFrame,PHASE_LABELS,type FlightSimulation} from "@/lib/flight-simulation";
import SimulationMap from "./simulation-map";
import "./flight-simulator.css";

type Props={name:string;drone:string;legs:Coordinate[][];boundary:Coordinate[];height:number;speed:number;gimbal:number;captureMode:CaptureMode;photoInterval:number;captureDistance:number;batteryMinutes:number;userPosition:Coordinate|null};
const n=(value:number,digits=1)=>value.toLocaleString("pt-BR",{maximumFractionDigits:digits});
function clock(seconds:number){const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;}
function FlightPlayer({simulation,boundary,pickHome,onPick}: {simulation:FlightSimulation;boundary:Coordinate[];pickHome:boolean;onPick:(p:Coordinate)=>void}){
 const [elapsed,setElapsed]=useState(0),[running,setRunning]=useState(false),[rate,setRate]=useState(4),[ready,setReady]=useState(false),[notice,setNotice]=useState("");
 const elapsedRef=useRef(0),frame=useMemo(()=>flightFrame(simulation,elapsed),[simulation,elapsed]);
 useEffect(()=>{
  const hide=()=>{if(document.hidden){setRunning(false);setNotice("Simulação pausada ao sair da aba. Use Continuar para retomar.");}};document.addEventListener("visibilitychange",hide);return()=>document.removeEventListener("visibilitychange",hide);
 },[]);
 useEffect(()=>{
  // eslint-disable-next-line react-hooks/set-state-in-effect -- A parent home-picking command pauses playback before the map is edited.
  if(pickHome)setRunning(false);
 },[pickHome]);
 useEffect(()=>{
  if(!running||!ready)return;let raf=0,last:number|null=null,paint=0;
  const tick=(now:number)=>{if(last===null){last=now;paint=now;}elapsedRef.current=advanceSimulation(elapsedRef.current,Math.max(0,now-last),rate,simulation.seconds);last=now;
   if(now-paint>=32||elapsedRef.current>=simulation.seconds){paint=now;setElapsed(elapsedRef.current);}
   if(elapsedRef.current>=simulation.seconds){setRunning(false);return;}raf=requestAnimationFrame(tick);
  };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
 },[running,ready,rate,simulation]);
 function seek(value:number){setRunning(false);const time=Math.min(simulation.seconds,Math.max(0,value));elapsedRef.current=time;setElapsed(time);setNotice("");}
 function play(){if(running){setRunning(false);return;}if(frame.finished){elapsedRef.current=0;setElapsed(0);}setNotice("");setRunning(true);}
 const phase=frame.finished?(simulation.returnHome?"Concluído · pouso simulado":"Concluído · último waypoint"):PHASE_LABELS[frame.phase];
 return <div data-testid="flight-player" data-playing={running} data-time={elapsed.toFixed(3)} data-duration={simulation.seconds} data-photos={frame.photosTaken}>
  <div className="sim-readouts"><div><span>ALTURA RELATIVA</span><strong data-testid="sim-height">{n(frame.height)} <small>m</small></strong></div><div><span>VELOCIDADE HORIZONTAL</span><strong>{n(frame.speed)} <small>m/s</small></strong></div><div><span>DISTÂNCIA NO MAPA</span><strong>{n(frame.distance,0)} <small>/ {n(simulation.horizontalM,0)} m</small></strong></div><div><span>FOTOS SIMULADAS</span><strong data-testid="sim-photo-count">{frame.photosTaken} <small>/ {simulation.photos.length}</small></strong></div></div>
  <SimulationMap simulation={simulation} frame={frame} boundary={boundary} running={running} pickHome={pickHome} onPick={p=>{setRunning(false);onPick(p);}} onReady={setReady}>
   <div className="sim-player-controls" data-map-tool-ui>
    <div className="sim-phase-row"><span role="status" data-testid="sim-phase">{phase}</span><span>{frame.leg>0?`Faixa ${frame.leg} · WP ${frame.waypoint}`:"Base H"}</span></div>
    <label className="sim-timeline-label"><span className="sim-sr-only">Posição na simulação</span><input aria-label="Posição na simulação" type="range" min={0} max={simulation.seconds} step="any" value={elapsed} onChange={e=>seek(Number(e.target.value))} aria-valuetext={`${clock(elapsed)} de ${clock(simulation.seconds)}`}/></label>
    <div className="sim-play-row"><button type="button" className="sim-play" onClick={play} disabled={!ready||pickHome} aria-label={running?"Pausar simulação":frame.finished?"Repetir simulação":elapsed>0?"Continuar simulação":"Iniciar simulação"}>{running?"Ⅱ Pausar":frame.finished?"↻ Repetir":elapsed>0?"▶ Continuar":"▶ Iniciar"}</button><button type="button" aria-label="Reiniciar simulação" onClick={()=>seek(0)}>↺ <span>Reiniciar</span></button><label className="sim-rate"><span className="sim-sr-only">Velocidade da reprodução</span><select aria-label="Velocidade da reprodução" value={rate} onChange={e=>setRate(Number(e.target.value))}>{[1,2,4,8,16,32].map(value=><option key={value} value={value}>{value}×</option>)}</select></label><span className="sim-clock" data-testid="sim-clock">{clock(elapsed)} <small>/ {clock(simulation.seconds)}</small></span></div>
   </div>
  </SimulationMap>
  {notice&&<p role="status" className="sim-notice">{notice}</p>}
  <div className="sim-legend"><span><i className="sim-green"/> Faixas e trajeto percorrido</span><span><i className="sim-gray"/> Conexões</span><span><i className="sim-blue"/> Ida e retorno simulados</span><span><i className="sim-gold"/> Fotos</span><button type="button" disabled={frame.photosTaken>=simulation.photos.length} onClick={()=>seek(simulation.photos[frame.photosTaken].time)}>Próxima foto →</button></div>
  <InfoPopover title="Hipóteses da simulação"><p className="sim-footnote">Drone ampliado para visualização; não está em escala real. Em 2D, aparece sobre a rota; em 3D, fica na altura relativa simulada. A linha é a projeção no solo. {simulation.photos.length>2000?`São exibidos até 2.000 pontos de foto como amostra; o contador usa todas as ${simulation.photos.length} posições.`:"As fotografias são apenas pontos virtuais; nenhuma imagem é capturada."}</p></InfoPopover>
 </div>;
}
export default function FlightSimulator(props:Props){
 const section=useRef<HTMLElement>(null),[home,setHome]=useState<Coordinate|null>(null),[pickHome,setPickHome]=useState(false),[climb,setClimb]=useState("2"),[descent,setDescent]=useState("2"),[turn,setTurn]=useState("1"),[returnHome,setReturnHome]=useState(true),[expanded,setExpanded]=useState(false);
 const computed=useMemo(()=>{try{return {simulation:buildFlightSimulation({legs:props.legs,height:props.height,speed:props.speed,captureMode:props.captureMode,photoInterval:props.photoInterval,captureDistance:props.captureDistance,home,climbSpeed:Number(climb),descentSpeed:Number(descent),turnSeconds:Number(turn),returnHome}),error:""};}catch(error){return {simulation:null,error:error instanceof Error?error.message:"Não foi possível simular o plano."};}},[props.legs,props.height,props.speed,props.captureMode,props.photoInterval,props.captureDistance,home,climb,descent,turn,returnHome]);
 const simulation=computed.simulation,key=JSON.stringify({home,climb,descent,turn,returnHome,legs:props.legs,height:props.height,speed:props.speed,captureMode:props.captureMode,photoInterval:props.photoInterval,captureDistance:props.captureDistance});
 useEffect(()=>{section.current?.scrollIntoView({block:"start",behavior:"instant"});},[]);
 useEffect(()=>{if(!expanded)return;const original=document.body.style.overflow;document.body.style.overflow="hidden";const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setExpanded(false);};document.addEventListener("keydown",escape);return()=>{document.body.style.overflow=original;document.removeEventListener("keydown",escape);};},[expanded]);
 return <section ref={section} id="flight-simulation" className={`flight-simulation${expanded?" sim-expanded":""}`} aria-label="Simulador de voo">
  <header className="sim-header"><div><span className="sim-eyebrow">PRÉVIA VIRTUAL · SEM COMANDOS AO DRONE</span><h2>{props.name||"Simular voo"}</h2><p>{props.drone} · {n(props.height)} m relativos à base · gimbal {n(props.gimbal,0)}°</p></div><button type="button" onClick={()=>setExpanded(v=>!v)}>{expanded?"Fechar tela ampliada":"Ampliar simulador"}</button></header>
  {computed.error&&<p role="alert" className="sim-notice">{computed.error} O plano original foi mantido.</p>}
  {simulation&&<FlightPlayer key={key} simulation={simulation} boundary={props.boundary} pickHome={pickHome} onPick={point=>{setHome(point);setPickHome(false);}}/>}
  {simulation&&simulation.seconds>props.batteryMinutes*60&&<p role="alert" className="sim-notice">A simulação supera os {n(props.batteryMinutes,0)} min úteis por bateria informados. Revise a rota e a autonomia antes do voo.</p>}
  <details className="sim-settings"><summary>Decolagem, retorno e hipóteses da simulação</summary><div className="sim-settings-body">
   <p><b>Base H:</b> {home?`${home[1].toFixed(6)}, ${home[0].toFixed(6)} · posição escolhida apenas para esta prévia.`:"primeiro waypoint, usado como hipótese. Não é uma posição GPS nem um ponto de decolagem confirmado."}</p>
   <div className="sim-setting-actions"><button type="button" aria-pressed={pickHome} onClick={()=>setPickHome(v=>!v)}>{pickHome?"Cancelar escolha de base":"Definir decolagem no mapa"}</button><button type="button" disabled={!props.userPosition} onClick={()=>{if(props.userPosition)setHome([...props.userPosition]);setPickHome(false);}}>Usar posição informada no planejador</button><button type="button" disabled={!home} onClick={()=>{setHome(null);setPickHome(false);}}>Voltar ao primeiro waypoint</button></div>
   <div className="sim-settings-grid"><label>Subida simulada (m/s)<input type="number" aria-label="Subida simulada" min={.2} max={10} step={.1} value={climb} onChange={e=>setClimb(e.target.value)}/></label><label>Descida simulada (m/s)<input type="number" aria-label="Descida simulada" min={.2} max={10} step={.1} value={descent} onChange={e=>setDescent(e.target.value)}/></label><label>Pausa nas mudanças de direção (s)<input type="number" aria-label="Pausa nas mudanças de direção" min={0} max={30} step={.1} value={turn} onChange={e=>setTurn(e.target.value)}/></label></div>
   <label className="sim-check"><input type="checkbox" checked={returnHome} onChange={e=>setReturnHome(e.target.checked)}/> Incluir retorno direto à base e pouso simulados</label>
   <p>Subida, descida e pausa são hipóteses editáveis, não especificações do {props.drone}. A altura permanece relativa à base; o relevo não é seguido. Mudanças aqui reiniciam apenas a prévia e não modificam o JSON, o KMZ, o histórico ou a rota original.</p>
  </div></details>
  <InfoPopover title="Hipóteses da simulação"><div className="sim-disclaimer"><p><b>O que está sendo simulado:</b> a sequência exata dos waypoints e as conexões entre faixas, em segmentos retos. Não são calculados arcos reais, aceleração, vento, obstáculos, sinal ou consumo de bateria.</p><p><b>Fotos:</b> {props.captureMode==="distance"?`uma posição virtual a cada ${n(props.captureDistance)} m.`:`prévia por intervalo de ${n(props.photoInterval)} s${props.captureMode==="manual"?", configurado manualmente no DJI Fly para o voo real":""}.`} Considera uma foto na chegada ao primeiro waypoint e captura contínua, inclusive nas conexões{props.captureMode!=="distance"?" e pausas de direção":""}, até o último waypoint; não simula a latência da câmera. Não fotografa na subida, ida, retorno ou pouso.</p>{simulation&&<p><b>Tempo:</b> rota em velocidade constante {clock(simulation.routeSeconds)}; com as hipóteses de subida, manobras e retorno, {clock(simulation.seconds)}. {simulation.seconds>props.batteryMinutes*60?`A duração supera os ${n(props.batteryMinutes,0)} min úteis por bateria informados. A prévia não divide missões nem simula trocas de bateria.`:"Não é uma previsão garantida de autonomia."}</p>}<p>A simulação não confirma segurança, autorização de voo ou aceitação da missão pelo DJI Fly.</p></div></InfoPopover>
 </section>;
}

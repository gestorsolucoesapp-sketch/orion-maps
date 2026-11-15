"use client";
import {useState} from "react";
import {photoMissionRoute} from "@/lib/photo-mission";
import type {Coordinate} from "@/lib/flight-plan";

const HELPER="http://127.0.0.1:48765";
const PC_ORIGIN="http://127.0.0.1:3001";
type Plan={name:string;drone:string;takeoff?:number[];captureMode?:"manual"|"time"|"distance";photoInterval?:number;settings:{height:number;speed:number;gimbal:number}};
type Health={helper?:string;connected:boolean;protocolVersion?:number;error?:string};
type Receipt={status:"done";name:string;waypoints:number;distance_m:number;sha256:string;backup:string;captureMode:string;photoInterval:number|null;previous_removed:boolean;finish_action:string};

async function localRequest<T>(path:string,body?:unknown):Promise<T>{
 try{
  const response=await fetch(`${HELPER}${path}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store",signal:body?undefined:AbortSignal.timeout(7000)});
  const result=await response.json() as T&{error?:string;helper?:string};
  // The helper uses 503 when USB is missing; the service itself is still ready.
  if(path==="/health"&&response.status===503&&result.helper==="ready")return result;
  if(!response.ok)throw new Error(result.error||"O conector RC 2 não confirmou a operação.");
  return result;
 }catch(error){
  if(error instanceof TypeError)throw new Error("Conector RC 2 indisponível neste PC. Reinicie o Orion Maps Local; ele inicia o conector automaticamente.");
  throw error;
 }
}

export default function RcTransfer({plan,legs,captureLegs,disabled}:{plan:Plan;legs:Coordinate[][];captureLegs:boolean[];disabled:boolean}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(""),[detailsOpen,setDetailsOpen]=useState(false);
 const [connection,setConnection]=useState<"idle"|"checking"|"ready"|"usb"|"offline"|"remote">("idle");
 const route=legs.flat();
 const unsupported=plan.captureMode==="distance";
 async function connect(){
  setDetailsOpen(true);
  if(window.location.origin!==PC_ORIGIN){setConnection("remote");setStatus("O envio USB ao RC 2 funciona no Pcmaquinas. Abra o Orion Maps Local no próprio PC para conferir a conexão e enviar a missão.");return;}
  setBusy(true);setConnection("checking");setStatus("Conferindo o conector e o RC 2...");
  try{
   const result=await localRequest<Health>("/health");
   if(result.protocolVersion!==2){setConnection("offline");setStatus("Conector RC 2 incompatível. Reinicie o Orion Maps Local e confira a versão instalada.");}
   else if(result.connected){setConnection("ready");setStatus("Conector integrado ativo; RC 2 e missão de referência encontrados. Feche completamente o DJI Fly antes de enviar.");}
   else{setConnection("usb");setStatus("Conector integrado ativo, mas o RC 2 ou a missão de referência não foram encontrados. Confira o USB e toque em Atualizar estado.");}
  }catch(e){setConnection("offline");setStatus((e as Error).message);}
  finally{setBusy(false);}
 }
 async function send(){
  if(window.location.origin!==PC_ORIGIN){setConnection("remote");setDetailsOpen(true);setStatus("O envio USB ao RC 2 funciona no Pcmaquinas. Abra o Orion Maps Local no próprio PC.");return;}
  setBusy(true);
  try{
   const health=await localRequest<Health>("/health");
   if(health.protocolVersion!==2)throw new Error("Conector RC 2 incompatível. Reinicie o Orion Maps Local antes de enviar.");
   if(!health.connected)throw new Error("Conecte o RC 2 por USB e confira se ele aparece no Explorador de Arquivos.");
   setConnection("ready");
   const photo=plan.captureMode==="time"?`fotos automáticas a cada ${plan.photoInterval} s (experimental)`:"fotos iniciadas no DJI Fly";
   if(!window.confirm(`Substituir a missão no RC 2?\n\n${plan.name} · ${route.length} pontos · ${plan.settings.height} m · ${photo}.\nAção final do KMZ: voltar ao Home registrado pelo DJI Fly (goHome).\n\nConfirme que o DJI Fly está completamente fechado, o drone está em solo e a rota foi revisada. O conector guardará a missão anterior e verificará o arquivo transferido.`))return;
   setDetailsOpen(true);setStatus("Copiando a missão anterior, transferindo o novo KMZ e lendo de volta do RC 2.");
   const captureRanges=plan.captureMode==="time"?photoMissionRoute(legs,captureLegs).captureRanges:[];
   const result=await localRequest<Receipt>("/transfer",{plan:{...plan,captureMode:plan.captureMode||"manual"},route,captureRanges});
   if(result.finish_action!=="goHome")throw new Error("O KMZ lido de volta não confirmou goHome. Não use esta missão.");
   setStatus(`Transferido e verificado no RC 2: ${result.waypoints} pontos. Backup salvo em ${result.backup}. ${result.captureMode==="time"?"O disparo automático continua experimental e precisa ser testado em voo.":"Confira a captura no DJI Fly."}${result.previous_removed?"":" A cópia antiga ainda aparece na pasta do controle; verifique antes de voar."}`);
  }catch(e){setDetailsOpen(true);setStatus((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="rc-transfer-action">
  <button type="button" className="flight-button rc-transfer-button" disabled={busy||disabled||unsupported||plan.drone!=="DJI Mini 5 Pro"} onClick={()=>void send()}>{busy?"Aguarde.":"Enviar ao RC 2 →"}</button>
  <button type="button" className="rc-transfer-info" aria-label="Conexão e detalhes do RC 2" aria-expanded={detailsOpen} aria-controls="rc-transfer-details" onClick={()=>{if(detailsOpen)setDetailsOpen(false);else void connect();}}>?</button>
  {detailsOpen&&<aside id="rc-transfer-details" className="rc-transfer-details" aria-label="Conexão e detalhes do RC 2"><div className="rc-transfer-details-heading"><strong>Enviar missão ao RC 2</strong><button type="button" aria-label="Fechar detalhes do RC 2" onClick={()=>setDetailsOpen(false)}>×</button></div>
   <p>No Pcmaquinas, conecte o controle por USB. O conector inicia junto com o Orion Maps Local; não é preciso abrir outro atalho. Feche completamente o DJI Fly e deixe o drone em solo antes do envio.</p>
   {route.length>0?<p><b>{route.length} pontos</b> · {plan.settings.height} m acima da decolagem · {plan.settings.speed} m/s · {plan.captureMode==="time"?`fotos a cada ${plan.photoInterval} s (experimental)`:"fotos manuais"}</p>:<p>Desenhe a área ou abra um plano salvo para habilitar o envio.</p>}
   {disabled&&<p>Antes de enviar: marque o ponto H, confira a rota, os parâmetros e os avisos exibidos no planejamento.</p>}
   {unsupported&&<p className="camera-warning">O envio por distância ainda não foi verificado no RC 2. Escolha fotos por tempo ou manual.</p>}
   <p className={`rc-connection-state rc-connection-state--${connection}`} role="status">{status||"Abra os detalhes para conferir o conector."}</p>
   <button type="button" className="flight-button" disabled={busy||connection==="remote"} onClick={()=>void connect()}>{busy?"Conferindo...":"Atualizar estado do RC 2"}</button>
   <p>O conector guarda a missão anterior no computador e verifica o arquivo lido de volta. A transferência não inicia o voo. Fotos automáticas por tempo continuam experimentais.</p>
   <p><b>Ação final configurada: voltar ao Home (goHome) após a conclusão da missão.</b> O Home real é registrado pelo DJI Fly; H é apenas referência de planejamento. RTH não é garantido se a missão for interrompida ou por limites de bateria, sinal e modo de voo. Confira a altitude RTH no DJI Fly. A missão não acompanha o relevo.</p>
  </aside>}
 </div>;
}

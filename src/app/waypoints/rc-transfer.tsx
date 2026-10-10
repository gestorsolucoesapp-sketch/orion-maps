"use client";
import {useState} from "react";

const HELPER="http://127.0.0.1:48765";
type Plan={name:string;drone:string;takeoff?:number[];captureMode?:"manual"|"time"|"distance";photoInterval?:number;settings:{height:number;speed:number;gimbal:number}};
type Receipt={status:"done";name:string;waypoints:number;distance_m:number;sha256:string;backup:string;captureMode:string;photoInterval:number|null;previous_removed:boolean};

async function localRequest<T>(path:string,body?:unknown):Promise<T>{
 try{
  const response=await fetch(`${HELPER}${path}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store",signal:body?undefined:AbortSignal.timeout(7000)});
  const result=await response.json() as T&{error?:string};
  if(!response.ok)throw new Error(result.error||"O assistente não confirmou a operação.");
  return result;
 }catch(error){
  if(error instanceof TypeError)throw new Error("Abra “Conectar Orion RC2” neste computador e tente novamente.");
  throw error;
 }
}

export default function RcTransfer({plan,route,disabled}:{plan:Plan;route:number[][];disabled:boolean}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(""),[detailsOpen,setDetailsOpen]=useState(false);
 const unsupported=plan.captureMode==="distance";
 async function connect(){setBusy(true);setDetailsOpen(true);try{const result=await localRequest<{connected:boolean}>("/health");setStatus(result.connected?"Assistente e missão do RC 2 encontrados. Feche completamente o DJI Fly antes de enviar.":"Assistente aberto, mas o RC 2 ou a missão de referência não foram encontrados.");}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 async function send(){
  setBusy(true);
  try{
   const health=await localRequest<{connected:boolean}>("/health");
   if(!health.connected)throw new Error("Conecte o RC 2 por USB e confira se ele aparece no Explorador de Arquivos.");
   const photo=plan.captureMode==="time"?`fotos automáticas a cada ${plan.photoInterval} s (experimental)`:"fotos iniciadas no DJI Fly";
   if(!window.confirm(`Substituir a missão no RC 2?\n\n${plan.name} · ${route.length} pontos · ${plan.settings.height} m · ${photo}.\n\nConfirme que o DJI Fly está completamente fechado, o drone está em solo e a rota foi revisada. O assistente guardará a missão anterior e verificará o arquivo transferido.`))return;
   setDetailsOpen(true);setStatus("Copiando a missão anterior, transferindo o novo KMZ e lendo de volta do RC 2…");
   const result=await localRequest<Receipt>("/transfer",{plan:{...plan,captureMode:plan.captureMode||"manual"},route});
   setStatus(`Transferido e verificado no RC 2: ${result.waypoints} pontos. Backup salvo em ${result.backup}. ${result.captureMode==="time"?"O disparo automático continua experimental e precisa ser testado em voo.":"Confira a captura no DJI Fly."}${result.previous_removed?"":" A cópia antiga ainda aparece na pasta do controle; verifique antes de voar."}`);
  }catch(e){setDetailsOpen(true);setStatus((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="rc-transfer-action">
  <button type="button" className="flight-button rc-transfer-button" disabled={busy||disabled||unsupported||plan.drone!=="DJI Mini 5 Pro"} onClick={send}>{busy?"Aguarde…":"Enviar ao RC 2 ↗"}</button>
  <button type="button" className="rc-transfer-info" aria-label="Conexão e detalhes do RC 2" aria-expanded={detailsOpen} aria-controls="rc-transfer-details" onClick={()=>setDetailsOpen(open=>!open)}>ⓘ</button>
  {detailsOpen&&<aside id="rc-transfer-details" className="rc-transfer-details" aria-label="Conexão e detalhes do RC 2"><div className="rc-transfer-details-heading"><strong>Enviar missão ao RC 2</strong><button type="button" aria-label="Fechar detalhes do RC 2" onClick={()=>setDetailsOpen(false)}>×</button></div>
   <p>Conecte o controle por USB e mantenha <b>Conectar Orion RC2</b> aberto neste computador. Feche completamente o DJI Fly e deixe o drone em solo antes do envio.</p>
   {route.length>0?<p><b>{route.length} pontos</b> · {plan.settings.height} m acima da decolagem · {plan.settings.speed} m/s · {plan.captureMode==="time"?`fotos a cada ${plan.photoInterval} s (experimental)`:"fotos manuais"}</p>:<p>Desenhe a área ou abra um plano salvo para habilitar o envio.</p>}
   {disabled&&<p>Antes de enviar: marque o ponto H, confira a rota e confirme a validação pré-voo abaixo do mapa.</p>}
   {unsupported&&<p className="camera-warning">O envio por distância ainda não foi verificado no RC 2. Escolha fotos por tempo ou manual.</p>}
   <button type="button" className="flight-button" disabled={busy} onClick={connect}>Conferir conexão</button>
   <p>O assistente guarda a missão anterior no computador e verifica o arquivo lido de volta. A transferência não inicia o voo. Fotos automáticas por tempo continuam experimentais.</p>
   <p>O ponto H calcula ida e volta, mas o Home real é definido pelo DJI Fly. A missão não acompanha o relevo.</p>
   {status&&<p role="status">{status}</p>}
  </aside>}
 </div>;
}

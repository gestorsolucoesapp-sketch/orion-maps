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
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const unsupported=plan.captureMode==="distance";
 async function connect(){setBusy(true);try{const result=await localRequest<{connected:boolean}>("/health");setStatus(result.connected?"Assistente e missão do RC 2 encontrados. Feche completamente o DJI Fly antes de enviar.":"Assistente aberto, mas o RC 2 ou a missão de referência não foram encontrados.");}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 async function send(){
  setBusy(true);
  try{
   const health=await localRequest<{connected:boolean}>("/health");
   if(!health.connected)throw new Error("Conecte o RC 2 por USB e confira se ele aparece no Explorador de Arquivos.");
   const photo=plan.captureMode==="time"?`fotos automáticas a cada ${plan.photoInterval} s (experimental)`:"fotos iniciadas no DJI Fly";
   if(!window.confirm(`Substituir a missão no RC 2?\n\n${plan.name} · ${route.length} pontos · ${plan.settings.height} m · ${photo}.\n\nConfirme que o DJI Fly está completamente fechado, o drone está em solo e a rota foi revisada. O assistente guardará a missão anterior e verificará o arquivo transferido.`))return;
   setStatus("Copiando a missão anterior, transferindo o novo KMZ e lendo de volta do RC 2…");
   const result=await localRequest<Receipt>("/transfer",{plan:{...plan,captureMode:plan.captureMode||"manual"},route});
   setStatus(`Transferido e verificado no RC 2: ${result.waypoints} pontos. Backup salvo em ${result.backup}. ${result.captureMode==="time"?"O disparo automático continua experimental e precisa ser testado em voo.":"Confira a captura no DJI Fly."}${result.previous_removed?"":" A cópia antiga ainda aparece na pasta do controle; verifique antes de voar."}`);
  }catch(e){setStatus((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="control-section"><div className="section-heading"><span>04</span><h2>Enviar missão ao RC 2</h2></div>
  <p>Conecte o controle por USB e mantenha <b>Conectar Orion RC2</b> aberto neste computador. Feche completamente o DJI Fly e deixe o drone em solo antes do envio.</p>
  {route.length>0?<p><b>{route.length} pontos</b> · {plan.settings.height} m acima da decolagem · {plan.settings.speed} m/s · {plan.captureMode==="time"?`fotos a cada ${plan.photoInterval} s (experimental)`:"fotos manuais"}</p>:<p>Desenhe a área ou abra um plano salvo para habilitar o envio.</p>}
  {unsupported&&<p className="camera-warning">O envio por distância ainda não foi verificado no RC 2. Escolha fotos por tempo ou manual.</p>}
  <button className="flight-button primary" disabled={busy||disabled||unsupported||plan.drone!=="DJI Mini 5 Pro"} onClick={send}>{busy?"Aguarde…":"Enviar plano ao controle"}</button>
  <p>O assistente guarda a missão anterior no computador e compara o arquivo lido de volta do RC 2. A transferência não inicia o voo.</p>
  <p>Fotos automáticas por tempo são experimentais: confira a missão no DJI Fly antes do voo e teste a captura em condições seguras.</p>
  <details><summary>Conexão e detalhes do envio</summary><button className="flight-button" disabled={busy} onClick={connect}>Conferir conexão</button><p>Se o assistente não estiver aberto, use o atalho <b>Conectar Orion RC2</b> na área de trabalho. O ponto H calcula ida e volta, mas o Home real é definido pelo DJI Fly. A missão não acompanha o relevo.</p></details>
  {status&&<p role="status">{status}</p>}
 </section>;
}

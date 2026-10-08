"use client";
import {useState} from "react";
import {controllerStatus,queueControllerTransfer,latestControllerTransfer} from "./transfer-actions";

export default function RcTransfer({plan,route,disabled}:{plan:{name:string;drone:string;settings:{height:number;speed:number;gimbal:number}};route:number[][];disabled:boolean}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 async function connect(){setBusy(true);try{const r=await controllerStatus();if(r.error)throw new Error(r.error);setStatus(r.device?.last_seen&&Date.now()-Date.parse(r.device.last_seen)<60000?"Assistente do computador conectado. Conecte também o RC 2 por USB.":"Abra Conectar Orion RC2 na área de trabalho deste computador.");}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 async function inspect(){setBusy(true);try{const r=await latestControllerTransfer();if(r.error)throw new Error(r.error);setStatus(r.transfer?new Date(r.transfer.created_at).toLocaleString("pt-BR")+" — "+(r.transfer.message||"Aguardando o assistente"):"Nenhum envio solicitado.");}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 async function send(){
  if(!window.confirm("ATENÇÃO: este envio pode substituir uma missão existente no DJI RC 2. O controle deve estar conectado por USB e o drone em solo. Confirma a substituição após revisar a rota e o backup?"))return;
  setBusy(true);
  try{
   const queued=await queueControllerTransfer({plan,route,ready:true});if(queued.error)throw new Error(queued.error);
   setStatus("Pedido enviado. O assistente vai gerar o KMZ, guardar o histórico e substituir a missão no RC 2…");
   for(let i=0;i<24;i++){
    await new Promise(resolve=>setTimeout(resolve,5000));
    const r=await latestControllerTransfer();if(r.error)throw new Error(r.error);
    if(r.transfer?.id===queued.id){setStatus(r.transfer.message||"Aguardando o assistente…");if(["done","error"].includes(r.transfer.status))return;}
   }
   setStatus("O envio ainda não foi confirmado. Use Consultar último envio antes de tentar novamente.");
  }catch(e){setStatus((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="control-section"><div className="section-heading"><span>04</span><h2>Enviar missão ao RC 2</h2></div>
  <p>Controle conectado por USB? Abra <b>Conectar Orion RC2</b> na área de trabalho e envie o plano.</p>
  {route.length>0?<p><b>{route.length} pontos</b> · {plan.settings.height} m acima da decolagem · {plan.settings.speed} m/s</p>:<p><b>Abra um plano em “Meus planos” ou desenhe a área no mapa para habilitar o envio.</b></p>}
  {route.length>0&&plan.drone!=="DJI Mini 5 Pro"&&<p>Selecione DJI Mini 5 Pro para usar este controle.</p>}
  <button className="flight-button primary" disabled={busy||disabled||plan.drone!=="DJI Mini 5 Pro"} onClick={send}>{busy?"Enviando…":"Enviar plano ao controle"}</button>
  <p>Substitui a missão no RC 2 e guarda a anterior no histórico. Não inicia o voo.</p>
  <details><summary>Conexão e detalhes do envio</summary><button className="flight-button" disabled={busy} onClick={connect}>Conferir conexão</button><button className="flight-button" disabled={busy} onClick={inspect}>Consultar último envio</button><p>Não edite a missão no DJI Fly durante a cópia. Confira a nova rota no controle antes do voo. Fotos temporizadas são iniciadas no controle; esta missão não acompanha o relevo.</p></details>
  {status&&<p role="status">{status}</p>}
 </section>;
}



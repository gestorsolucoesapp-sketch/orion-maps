"use client";
import {useState} from "react";
import {controllerStatus,queueControllerTransfer,latestControllerTransfer} from "./transfer-actions";

export default function RcTransfer({plan,route,disabled}:{plan:{name:string;drone:string;settings:{height:number;speed:number;gimbal:number}};route:number[][];disabled:boolean}){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 async function connect(){setBusy(true);try{const r=await controllerStatus();if(r.error)throw new Error(r.error);setStatus(r.device?.last_seen&&Date.now()-Date.parse(r.device.last_seen)<60000?"Assistente do computador conectado. Conecte também o RC 2 por USB.":"Abra Conectar Orion RC2 na área de trabalho deste computador.");}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 async function inspect(){setBusy(true);try{const r=await latestControllerTransfer();if(r.error)throw new Error(r.error);setStatus(r.transfer?new Date(r.transfer.created_at).toLocaleString("pt-BR")+" — "+(r.transfer.message||"Aguardando o assistente"):"Nenhum envio solicitado.");}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 async function send(){
  setBusy(true);
  try{
   const queued=await queueControllerTransfer({plan,route,ready});if(queued.error)throw new Error(queued.error);
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
  <p>Conecte o controle por USB em transferência de arquivos e abra <b>Conectar Orion RC2</b> na área de trabalho. Entre na sua conta Orion para usar o histórico.</p>
  <button className="flight-button" disabled={busy} onClick={connect}>Conferir conexão</button>
  <p>Altura relativa à decolagem: <b>{plan.settings.height} m</b>. Velocidade: <b>{plan.settings.speed} m/s</b>. Gimbal: <b>{plan.settings.gimbal}°</b>. {route.length} pontos de voo. Sem acompanhamento do terreno ou disparo automático.</p>
  <label><input type="checkbox" checked={ready} onChange={e=>setReady(e.target.checked)}/> O drone está em solo e não estou editando a missão no DJI Fly. Vou conferir a nova rota antes do voo.</label>
  <button className="flight-button primary" disabled={busy||disabled||!ready||plan.drone!=="DJI Mini 5 Pro"} onClick={send}>{busy?"Aguarde…":"Gerar e substituir KMZ no RC 2"}</button>
  <button className="flight-button" disabled={busy} onClick={inspect}>Consultar último envio</button>
  <p>A versão anterior fica no histórico. No controle, o novo arquivo ocupa o mesmo lugar. Reabra o DJI Fly após a confirmação e confira a rota em solo. Configure e inicie as fotos temporizadas no controle.</p>
  {status&&<p role="status">{status}</p>}
 </section>;
}



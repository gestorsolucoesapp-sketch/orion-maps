"use client";
import {useState} from "react";
import {archiveControllerMission,listMissionVersions} from "./history-actions";

export default function RcTransfer({plan,route,disabled}:{plan:{name:string;drone:string;settings:{height:number;speed:number;gimbal:number}};route:number[][];disabled:boolean}){
 const [code,setCode]=useState("");
 const [closed,setClosed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 async function bridge(path:string,body:unknown){
  let response:Response;
  try{response=await fetch(`http://127.0.0.1:47831${path}`,{method:"POST",headers:{"Content-Type":"application/json","X-Orion-Key":code.trim()},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});}
  catch{throw new Error("Não foi possível falar com o assistente. Abra Conectar Orion RC2 neste computador e permita a conexão local se o navegador solicitar. Se o envio já começou, confira o controle antes de tentar novamente.");}
  const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||"Falha no assistente.");return result;
 }
 async function connect(){setBusy(true);try{await bridge('/status',{});setStatus("RC 2 conectado. A missão existente será substituída, mantendo seu nome de arquivo.");}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 async function send(){
  setBusy(true);
  try{
   if(!closed)throw new Error("Feche o DJI Fly antes de substituir o arquivo.");
   const auth=await listMissionVersions();if(auth.error)throw new Error(auth.error);
   setStatus("Lendo missão do controle e gerando os novos pontos…");
   const prepared=await bridge('/prepare',{plan,route});
   setStatus("Guardando a missão anterior e a nova no seu histórico…");
   const old=await archiveControllerMission("Anterior do RC 2",null,prepared.target,prepared.backup,"device_backup");if(old.error)throw new Error(old.error);
   const next=await archiveControllerMission(plan.name,plan,prepared.target,prepared.kmz,"wpml_unverified");if(next.error)throw new Error(next.error);
   setStatus("Substituindo o KMZ no RC 2 e conferindo a cópia…");
   const result=await bridge('/commit',{job:prepared.job,sha256:prepared.sha256,closed:true});
   if(!result.verified)throw new Error("A cópia não foi confirmada. Confira o controle.");
   setStatus(`KMZ substituído e conferido no RC 2: ${prepared.points} pontos. Abra o DJI Fly e confira a nova rota em solo. As fotos temporizadas precisam ser iniciadas no controle.`);
  }catch(e){setStatus((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="control-section"><div className="section-heading"><span>04</span><h2>Enviar missão ao RC 2</h2></div>
  <p>Conecte o controle por USB em transferência de arquivos e abra <b>Conectar Orion RC2</b> no computador.</p>
  <label>Código do assistente<input aria-label="Código do assistente RC 2" type="password" autoComplete="off" value={code} onChange={e=>setCode(e.target.value)}/></label>
  <button className="flight-button" disabled={busy||!code.trim()} onClick={connect}>Conferir conexão</button>
  <p>Altura relativa à decolagem: <b>{plan.settings.height} m</b>. Velocidade: <b>{plan.settings.speed} m/s</b>. Gimbal: <b>{plan.settings.gimbal}°</b>. {route.length} pontos de voo. Sem acompanhamento do terreno ou disparo automático.</p>
  <label><input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)}/> Fechei o DJI Fly; o drone está em solo. Vou conferir a missão antes do voo.</label>
  <button className="flight-button primary" disabled={busy||disabled||!closed||!code.trim()||plan.drone!=="DJI Mini 5 Pro"} onClick={send}>{busy?"Aguarde…":"Gerar e substituir KMZ no RC 2"}</button>
  <p>A versão anterior fica no histórico. No controle, o novo arquivo ocupa o mesmo lugar. Compatibilidade de execução ainda precisa ser conferida no DJI Fly.</p>
  {status&&<p role="status">{status}</p>}
 </section>;
}

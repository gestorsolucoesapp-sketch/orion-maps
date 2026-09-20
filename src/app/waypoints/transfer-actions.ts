"use server";
import {surveySession,supabaseRequest} from "@/lib/supabase/surveys";
export async function controllerStatus(){
 try{const {token}=await surveySession();const devices=await supabaseRequest<{id:string;name:string;last_seen:string|null}[]>("/rest/v1/rc_devices?select=id,name,last_seen&enabled=eq.true",token);return {device:devices[0]||null,error:""};}
 catch(e){return {device:null,error:e instanceof Error?e.message:"Falha ao consultar o assistente."};}
}
export async function queueControllerTransfer(payload:unknown){
 try{
  const {token,user}=await surveySession();
  const p=payload as {ready?:boolean;route?:number[][];plan?:{name?:string;drone?:string;settings?:{height:number;speed:number;gimbal:number}}};
  if(!p||p.ready!==true||!p.plan||p.plan.drone!=="DJI Mini 5 Pro"||typeof p.plan.name!=="string"||!p.plan.name.trim()||p.plan.name.length>120||!Array.isArray(p.route)||p.route.length<2||p.route.length>200||JSON.stringify(p).length>150000)throw new Error("Confira o plano e confirme que o drone está em solo.");
  if(!p.route.every(a=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite)&&Math.abs(a[0])<=180&&Math.abs(a[1])<=75))throw new Error("Coordenadas inválidas.");
  const s=p.plan.settings;if(!s||!Number.isFinite(s.height)||s.height<1||s.height>500||!Number.isFinite(s.speed)||s.speed<=0||s.speed>15||!Number.isFinite(s.gimbal)||s.gimbal< -90||s.gimbal>0)throw new Error("Parâmetros fora dos limites do envio.");
  const status=await controllerStatus();if(status.error)throw new Error(status.error);
  if(!status.device?.last_seen||Date.now()-Date.parse(status.device.last_seen)>60000)throw new Error("Abra Conectar Orion RC2 no computador e tente novamente.");
  const active=await supabaseRequest<{id:string}[]>("/rest/v1/rc_transfers?status=in.(queued,working,archived)&select=id&limit=1",token);
  if(active.length)throw new Error("Já existe um envio em andamento. Consulte o último envio.");
  const rows=await supabaseRequest<{id:string}[]>("/rest/v1/rc_transfers",token,{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({user_id:user.id,device_id:status.device.id,payload:p})});
  return {id:rows[0].id,error:""};
 }catch(e){return {id:"",error:e instanceof Error?e.message:"Não foi possível solicitar o envio."};}
}
export async function latestControllerTransfer(){
 try{const {token}=await surveySession();const rows=await supabaseRequest<{id:string;status:string;message:string;created_at:string}[]>("/rest/v1/rc_transfers?select=id,status,message,created_at&order=created_at.desc&limit=1",token);return {transfer:rows[0]||null,error:""};}
 catch(e){return {transfer:null,error:e instanceof Error?e.message:"Falha ao consultar envio."};}
}


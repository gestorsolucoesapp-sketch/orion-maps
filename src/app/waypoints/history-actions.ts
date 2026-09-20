"use server";
import {createHash} from "node:crypto";
import {unzipSync} from "fflate";
import {surveySession,supabaseRequest} from "@/lib/supabase/surveys";

export async function saveMissionVersion(name:string,plan:unknown,base64:string){
 try {
  const {user,token}=await surveySession();
  if(typeof name!=="string"||!name.trim()||name.length>120||typeof base64!=="string"||base64.length>1400000||! /^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error("Arquivo de revisão inválido ou grande demais.");
  const serialized=JSON.stringify(plan);
  if(!serialized||serialized.length>150000||!plan||typeof plan!=="object")throw new Error("Plano inválido.");
  const bytes=Buffer.from(base64,"base64");
  const files=unzipSync(bytes,{filter:f=>f.name==="doc.kml"&&f.originalSize<=2000000});
  if(!files['doc.kml'])throw new Error("Este botão guarda somente KMZ de revisão do Orion.");
  const rows=await supabaseRequest<{id:string}[]>("/rest/v1/mission_versions",token,{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({user_id:user.id,name:name.trim(),kind:"preview",plan,kmz_base64:base64,sha256:createHash("sha256").update(bytes).digest("hex")})});
  return {id:rows[0].id,error:""};
 }catch(e){return {id:"",error:e instanceof Error?e.message:"Não foi possível guardar a versão."};}
}
export async function listMissionVersions(){
 try {const {token}=await surveySession();return {rows:await supabaseRequest<{id:string;name:string;kind:string;created_at:string}[]>("/rest/v1/mission_versions?select=id,name,kind,created_at&order=created_at.desc&limit=100",token),error:""};}
 catch(e){return {rows:[],error:e instanceof Error?e.message:"Não foi possível consultar o histórico."};}
}
export async function readMissionVersion(id:string){
 try {
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw new Error("Versão inválida.");
  const {token}=await surveySession();
  const rows=await supabaseRequest<{name:string;kind:string;plan:unknown;kmz_base64:string;sha256:string;target_id:string|null}[]>(`/rest/v1/mission_versions?id=eq.${id}&select=name,kind,plan,kmz_base64,sha256,target_id&limit=1`,token);
  if(!rows[0])throw new Error("Versão não encontrada.");
  if(createHash("sha256").update(Buffer.from(rows[0].kmz_base64,"base64")).digest("hex")!==rows[0].sha256)throw new Error("A integridade do arquivo não pôde ser confirmada.");
  return {version:rows[0],error:""};
 }catch(e){return {version:null,error:e instanceof Error?e.message:"Não foi possível recuperar a versão."};}
}

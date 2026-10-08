"use server";
import {surveySession,supabaseRequest} from "@/lib/supabase/surveys";
import {validateCustomDrone,uuid,type CustomDroneProfile} from "@/lib/survey-planning";

export async function listCustomDroneProfiles(){
 try{
  const {token}=await surveySession();
  const data=await supabaseRequest<{profile:unknown;created_at:string}[]>("/rest/v1/user_drone_profiles?select=profile,created_at&order=created_at.desc&limit=100",token);
  const rows=data.map(row=>({...validateCustomDrone(row.profile),created_at:row.created_at}));
  return {rows,error:""};
 }catch{return {rows:[] as CustomDroneProfile[],error:"Não foi possível consultar seus drones cadastrados. Tente novamente."};}
}
export async function createCustomDroneProfile(input:unknown){
 try{
  const {user,token}=await surveySession(),profile=validateCustomDrone(input);
  const existing=await supabaseRequest<{profile:unknown}[]>(`/rest/v1/user_drone_profiles?id=eq.${profile.id}&select=profile&limit=1`,token);
  if(existing[0]){const old=validateCustomDrone(existing[0].profile);if(JSON.stringify(old)!==JSON.stringify(profile))throw Error("Esta solicitação já pertence a outro cadastro.");return {row:old,error:""};}
  const saved=await supabaseRequest<{profile:unknown}[]>("/rest/v1/user_drone_profiles?select=profile",token,{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({id:profile.id,owner_id:user.id,name:profile.name,profile})});
  if(!saved[0])throw Error("O cadastro não foi confirmado.");
  return {row:validateCustomDrone(saved[0].profile),error:""};
 }catch(e){const raw=e instanceof Error?e.message:"Falha ao cadastrar drone.";return {row:null,error:/duplicate|23505|unique/i.test(raw)?"Já existe um drone com esse nome na sua conta. Atualize a lista ou use outro nome.":raw};}
}
export async function readCustomDroneProfile(id:string){
 const {token}=await surveySession();if(!uuid(id))throw Error("Drone cadastrado inválido.");
 const rows=await supabaseRequest<{profile:unknown}[]>(`/rest/v1/user_drone_profiles?id=eq.${id}&select=profile&limit=1`,token);
 if(!rows[0])throw Error("Drone não encontrado ou sem acesso.");return validateCustomDrone(rows[0].profile);
}

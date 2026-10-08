import {NextRequest,NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/supabase/auth";
import {MapLocationError,MAX_MAP_LINK_LENGTH} from "@/lib/google-maps-location";
import {resolveGoogleMapsLocation,isSameMapOrigin} from "@/lib/server/google-maps-resolver";
export const runtime="nodejs";
export const maxDuration=15;
const attempts=new Map<string,{start:number;count:number}>();
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
async function readInput(request:Request){
 if(!request.headers.get("content-type")?.startsWith("application/json"))throw new MapLocationError("Envie o link no campo de importação.");
 const limit=MAX_MAP_LINK_LENGTH+1500;if(Number(request.headers.get("content-length"))>limit)throw new MapLocationError("Link muito longo.");
 const reader=request.body?.getReader();if(!reader)throw new MapLocationError("Cole o link do Google Maps.");
 let length=0;const parts:Uint8Array[]=[];
 try{while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>limit){await reader.cancel();throw new MapLocationError("Link muito longo.");}parts.push(chunk.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let cursor=0;for(const part of parts){bytes.set(part,cursor);cursor+=part.length;}
 let body:unknown;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new MapLocationError("Solicitação inválida.");}
 if(!body||typeof body!=="object"||!("input" in body)||typeof body.input!=="string"||body.input.length>MAX_MAP_LINK_LENGTH)throw new MapLocationError("Cole um link válido do Google Maps.");return body.input;
}
export async function POST(request:NextRequest){
 const origin=request.headers.get("origin");if(!isSameMapOrigin(origin,request.headers.get("host")))return reply({error:"Origem da solicitação não autorizada."},403);
 try{
  const user=await getCurrentUser();if(!user)return reply({error:"Entre na sua conta para importar um link curto. Links completos com coordenadas também podem ser colados."},401);
  const now=Date.now();for(const [key,a] of attempts)if(now-a.start>60000)attempts.delete(key);
  const a=attempts.get(user.id);if(a&&a.count>=20)return reply({error:"Muitas tentativas. Aguarde um minuto e tente novamente."},429);
  if(!a){if(attempts.size>=1000)return reply({error:"Importação ocupada. Tente novamente em instantes."},429);attempts.set(user.id,{start:now,count:1});}else a.count++;
  const input=await readInput(request),location=await resolveGoogleMapsLocation(input);return reply({location});
 }catch(e){return reply({error:e instanceof MapLocationError?e.message:"Não foi possível importar agora. Tente novamente ou cole latitude e longitude."},e instanceof MapLocationError&&e.code==="network"?502:400);}
}

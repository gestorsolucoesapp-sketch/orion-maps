import sharp from "sharp";
import {createHash} from "node:crypto";

type Config={url:string;publishableKey:string};
type RecordRow={id:string;owner_id:string;job_id:string;kind:string;storage_path:string;size_bytes:number;created_at:string};
type Preview={data:Buffer;etag:string;sourceBytes:number;width:number;height:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INPUT=160*1024*1024,MAX_CACHE=12*1024*1024,TTL=10*60*1000;
const cache=new Map<string,{expires:number;value:Preview}>();
const inflight=new Map<string,Promise<Preview>>();
export class PreviewError extends Error {status:number;constructor(message:string,status:number){super(message);this.status=status;}}
function trimCache(){
  let bytes=0;for(const [key,entry] of cache){if(entry.expires<=Date.now())cache.delete(key);else bytes+=entry.value.data.length;}
  for(const [key,entry] of cache){if(bytes<=MAX_CACHE)break;cache.delete(key);bytes-=entry.value.data.length;}
}
async function boundedBody(response:Response){
  if(Number(response.headers.get("content-length"))>MAX_INPUT){await response.body?.cancel();throw new PreviewError("Ortofoto excede o limite da prévia rápida.",413);}
  const reader=response.body?.getReader();if(!reader)throw new PreviewError("Arquivo da ortofoto sem conteúdo.",502);
  const parts:Buffer[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_INPUT){await reader.cancel();throw new PreviewError("Ortofoto excede o limite da prévia rápida.",413);}parts.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  return Buffer.concat(parts,total);
}
/** Complete footprint, no crop/rotation/filling/geo edits or original-file writes. */
export async function encodeOrthophotoPreview(input:Buffer):Promise<Preview>{
  const {data,info}=await sharp(input,{limitInputPixels:160000000,sequentialRead:true})
    .resize({width:2400,height:2400,fit:"inside",withoutEnlargement:true})
    .webp({quality:84,alphaQuality:100,effort:3}).toBuffer({resolveWithObject:true});
  if(data.length>4*1024*1024)throw new PreviewError("Prévia excede o limite de resposta. O original permanece disponível.",413);
  return {data,etag:'"'+createHash("sha256").update(data).digest("hex")+'"',sourceBytes:input.length,width:info.width,height:info.height};
}
/** Every request passes Postgres RLS before consulting the private in-memory cache. */
export async function getProcessingPreview(id:string,token:string,config:Config,fetcher:typeof fetch=fetch):Promise<Preview>{
  if(!token)throw new PreviewError("Sua sessão expirou. Entre novamente.",401);
  if(!uuid.test(id))throw new PreviewError("Resultado inválido.",400);
  const headers={apikey:config.publishableKey,Authorization:`Bearer ${token}`};
  const query=new URLSearchParams({select:"id,owner_id,job_id,kind,storage_path,size_bytes,created_at",id:`eq.${id}`,kind:"eq.orthophoto",limit:"1"});
  const response=await fetcher(`${config.url}/rest/v1/processing_results?${query}`,{headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
  if(response.status===401)throw new PreviewError("Sua sessão expirou. Entre novamente.",401);
  if(!response.ok)throw new PreviewError("Não foi possível consultar a prévia da ortofoto.",502);
  const rows=await response.json() as RecordRow[];const item=Array.isArray(rows)?rows[0]:undefined;
  if(!item)throw new PreviewError("Ortofoto indisponível para esta conta.",404);
  const segments=item.storage_path.split("/");
  if(item.kind!=="orthophoto"||!uuid.test(item.owner_id)||!uuid.test(item.job_id)||segments[0]!==item.owner_id||segments[1]!==item.job_id||segments[2]!=="orthophoto"||segments.some(s=>!s||s==="."||s===".."||/[\\\u0000-\u001f]/.test(s))||! /\.(png|jpe?g|webp)$/i.test(item.storage_path))throw new PreviewError("Formato da ortofoto não disponível para prévia.",415);
  if(item.size_bytes>MAX_INPUT)throw new PreviewError("Ortofoto excede o limite da prévia rápida.",413);
  const key=JSON.stringify([item.owner_id,item.id,item.storage_path,item.size_bytes,item.created_at]);
  trimCache();const hit=cache.get(key);if(hit){cache.delete(key);cache.set(key,hit);return hit.value;}
  const pending=inflight.get(key);if(pending)return pending;
  if(inflight.size>=2)throw new PreviewError("Preparando outras prévias. Tente novamente em alguns segundos.",503);
  const task=(async()=>{
    const asset=await fetcher(`${config.url}/storage/v1/object/authenticated/processing-results/${segments.map(encodeURIComponent).join("/")}`,{headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(40000)});
    if(!asset.ok)throw new PreviewError("Não foi possível ler a ortofoto original para preparar a prévia.",asset.status===401?401:502);
    const preview=await encodeOrthophotoPreview(await boundedBody(asset));
    cache.set(key,{value:preview,expires:Date.now()+TTL});trimCache();return preview;
  })();
  inflight.set(key,task);
  try{return await task;}finally{if(inflight.get(key)===task)inflight.delete(key);}
}

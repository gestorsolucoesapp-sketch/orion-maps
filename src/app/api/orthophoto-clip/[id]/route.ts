import {getCurrentAccessToken,getCurrentUser} from "@/lib/supabase/auth";
import {getSupabaseConfig} from "@/lib/supabase/config";
import {listProcessingResults} from "@/lib/supabase/processing-results";
import {renderOrthophotoClip} from "@/lib/server/orthophoto-clip";

export const runtime="nodejs";
export const maxDuration=60;
export const dynamic="force-dynamic";
const privateHeaders={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_INPUT=160*1024*1024;

async function boundedBody(response:Response):Promise<Buffer>{
  if(Number(response.headers.get("content-length"))>MAX_INPUT)throw new Error("A ortofoto excede o limite de recorte privado.");
  const reader=response.body?.getReader();if(!reader)throw new Error("Arquivo da ortofoto vazio.");
  const chunks:Buffer[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_INPUT){await reader.cancel();throw new Error("A ortofoto excede o limite de recorte privado.");}chunks.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks,total);
}

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const token=await getCurrentAccessToken();
  if(!token)return Response.json({error:"Sua sessão expirou. Entre novamente."},{status:401,headers:privateHeaders});
  try{
    const {id}=await params,url=new URL(request.url),surveyId=url.searchParams.get("survey")||"";
    if(!uuid.test(id)||!uuid.test(surveyId))return Response.json({error:"Referência inválida."},{status:400,headers:privateHeaders});
    const encoded=url.searchParams.get("clip")||"";
    if(!encoded||encoded.length>10000)return Response.json({error:"Contorno de recorte inválido."},{status:400,headers:privateHeaders});
    let clip:unknown;try{clip=JSON.parse(encoded);}catch{return Response.json({error:"Contorno de recorte inválido."},{status:400,headers:privateHeaders});}
    const requested=url.searchParams.get("mode");
    const mode=requested==="download"||requested==="worldfile"||requested==="projection"?requested:"preview";
    const result=(await listProcessingResults(surveyId,token)).find(r=>r.id===id&&r.kind==="orthophoto"&&r.survey_id===surveyId);
    if(!result)return Response.json({error:"Ortofoto indisponível para esta conta."},{status:404,headers:privateHeaders});
    const bounds=result.metadata?.bounds_wgs84 as {west:number;south:number;east:number;north:number}|undefined;
    if(!bounds)return Response.json({error:"A ortofoto não tem limites geográficos para o recorte."},{status:422,headers:privateHeaders});
    if(!["image/png","image/jpeg","image/webp"].includes(result.mime_type||""))return Response.json({error:"Este formato não pode ser entregue com recorte privado."},{status:415,headers:privateHeaders});
    const user=await getCurrentUser();
    const segments=result.storage_path.split("/");
    if(!user||segments.length<4||segments[0]!==user.id||segments[1]!==result.job_id||segments[2]!=="orthophoto"||segments.some(s=>!s||s==="."||s===".."||/[\\\u0000-\u001f]/.test(s)))return Response.json({error:"Caminho da ortofoto inválido."},{status:422,headers:privateHeaders});
    const config=getSupabaseConfig();
    const source=await fetch(`${config.url}/storage/v1/object/authenticated/processing-results/${segments.map(encodeURIComponent).join("/")}`,{headers:{apikey:config.publishableKey,Authorization:`Bearer ${token}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(45000)});
    if(!source.ok)throw new Error("Não foi possível obter a ortofoto para recorte.");
    const cut=await renderOrthophotoClip(await boundedBody(source),bounds,clip,mode==="preview"?"preview":"download");
    if(mode==="worldfile")return new Response(cut.worldFile,{headers:{...privateHeaders,"Content-Type":"text/plain; charset=utf-8","Content-Disposition":"attachment; filename=ortofoto-recortada.pgw"}});
    if(mode==="projection")return new Response('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]\n',{headers:{...privateHeaders,"Content-Type":"text/plain; charset=utf-8","Content-Disposition":"attachment; filename=ortofoto-recortada.prj"}});
    const headers={...privateHeaders,"Content-Type":"image/png","Content-Length":String(cut.png.length),"X-Orion-Clip":"polygon-outward-metres-v1","X-Orion-Bounds-WGS84":JSON.stringify(cut.bounds),"X-Orion-Coverage-Limited":String(cut.coverageLimited)};
    if(mode==="download")Object.assign(headers,{"Content-Disposition":"attachment; filename=ortofoto-recortada.png"});
    return new Response(new Uint8Array(cut.png),{headers});
  }catch(error){
    const message=error instanceof Error?error.message:"Não foi possível recortar a ortofoto.";
    return Response.json({error:message},{status:/contorno|margem|vértices|terreno|georreferenciamento|limites/i.test(message)?422:502,headers:privateHeaders});
  }
}

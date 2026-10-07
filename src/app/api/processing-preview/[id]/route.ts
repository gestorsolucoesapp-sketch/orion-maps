import {getCurrentAccessToken} from "@/lib/supabase/auth";
import {getSupabaseConfig} from "@/lib/supabase/config";
import {getProcessingPreview,PreviewError} from "@/lib/server/processing-preview";

export const runtime="nodejs";
export const maxDuration=60;
export const dynamic="force-dynamic";
const privateHeaders={"Cache-Control":"private, max-age=300, must-revalidate","Vary":"Cookie","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"};

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const token=await getCurrentAccessToken();
    if(!token)throw new PreviewError("Sua sessão expirou. Entre novamente.",401);
    const {id}=await params;
    const preview=await getProcessingPreview(id,token,getSupabaseConfig());
    const headers={...privateHeaders,"Content-Type":"image/webp","ETag":preview.etag,"X-Orion-Preview":"2400px-original-preserved-v1","X-Original-Bytes":String(preview.sourceBytes)};
    if(request.headers.get("if-none-match")===preview.etag)return new Response(null,{status:304,headers});
    return new Response(new Uint8Array(preview.data),{headers:{...headers,"Content-Length":String(preview.data.length)}});
  }catch(error){
    const status=error instanceof PreviewError?error.status:502;
    const message=error instanceof PreviewError?error.message:"Não foi possível preparar a prévia. Tente novamente; o arquivo original não foi alterado.";
    return Response.json({error:message},{status,headers:{...privateHeaders,"Cache-Control":"private, no-store"}});
  }
}

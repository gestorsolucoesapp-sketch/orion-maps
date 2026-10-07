import {getCurrentAccessToken} from "@/lib/supabase/auth";
import {listProcessingResults} from "@/lib/supabase/processing-results";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const token=await getCurrentAccessToken();
  if(!token)return Response.json({error:"Sua sessão expirou. Entre novamente."},{status:401,headers:{"cache-control":"no-store"}});
  const {id}=await params;
  const url=new URL(request.url);
  const surveyId=url.searchParams.get("survey")||"";
  const mode=url.searchParams.get("mode")==="preview"?"preview":"download";
  if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f-]{36}$/i.test(surveyId)){
    return Response.json({error:"Referência inválida."},{status:400,headers:{"cache-control":"no-store"}});
  }
  try{
    const results=await listProcessingResults(surveyId,token);
    const item=results.find(r=>r.id===id);
    if(!item)return Response.json({error:"Resultado não encontrado ou sem acesso."},{status:404,headers:{"cache-control":"no-store"}});
    const target=mode==="preview"?(item.preview_url||item.download_url):item.download_url;
    if(!target)return Response.json({error:"Arquivo indisponível."},{status:404,headers:{"cache-control":"no-store"}});
    return Response.json({url:target,expires_in:item.signed_url_expires_seconds||3600},{headers:{"cache-control":"no-store","content-type":"application/json"}});
  }catch(e){
    return Response.json({error:e instanceof Error?e.message:"Não foi possível renovar o acesso ao arquivo."},{status:502,headers:{"cache-control":"no-store"}});
  }
}

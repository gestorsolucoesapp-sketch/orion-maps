import type {ProcessingResult} from "@/lib/supabase/processing-results";

type Mode="preview"|"download";
const cache=new Map<string,{url:string;expires:number}>();

export async function freshProcessingUrl(item:Pick<ProcessingResult,"id"|"survey_id">,mode:Mode):Promise<string>{
  const key=item.id+":"+mode,now=Date.now(),saved=cache.get(key);
  if(saved&&saved.expires>now)return saved.url;
  const response=await fetch(`/api/processing-link/${encodeURIComponent(item.id)}?survey=${encodeURIComponent(item.survey_id)}&mode=${mode}`,{cache:"no-store"});
  const body=await response.json().catch(()=>({})) as {url?:string;expires_in?:number;error?:string};
  if(!response.ok||!body.url)throw new Error(body.error||"Não foi possível renovar o acesso ao arquivo.");
  const ttl=Math.max(60,Math.min(2700,Number(body.expires_in)||3600));
  cache.set(key,{url:body.url,expires:now+ttl*1000});
  return body.url;
}
export function clearFreshProcessingUrl(id?:string){
  for(const key of [...cache.keys()])if(!id||key.startsWith(id+":"))cache.delete(key);
}

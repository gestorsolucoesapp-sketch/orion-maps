export type EngineStatus={state:"unconfigured"|"ready"|"unavailable";message:string;version?:string};
export async function inspectEngine(rawUrl:string|undefined,token:string|undefined,request:typeof fetch=fetch):Promise<EngineStatus>{
 if(!rawUrl)return {state:"unconfigured",message:"Servidor ainda não configurado. Escolha o computador ou servidor onde o NodeODM será instalado."};
 try{
  const base=new URL(rawUrl);
  const local=["localhost","127.0.0.1","[::1]"].includes(base.hostname);
  if(base.username||base.password||base.search||base.hash||(!local&&base.protocol!=="https:")||!["http:","https:"].includes(base.protocol))throw new Error();
  if(!local&&!token)throw new Error();
  base.pathname=base.pathname.replace(/\/$/,"")+"/info";
  if(token)base.searchParams.set("token",token);
  const response=await request(base,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error();
  const data=await response.json();
  if(data.engine!=="odm"||typeof data.version!=="string"||typeof data.engineVersion!=="string")throw new Error();
  return {state:"ready",message:"NodeODM respondeu. O envio de tarefas ainda depende da configuração da fila e do armazenamento dos resultados.",version:data.engineVersion.slice(0,40)};
 }catch{return {state:"unavailable",message:"Não foi possível validar o NodeODM. Confira o endereço, a autenticação e se o servidor está ligado."};}
}

import {MapLocationError,mapInputUrl,parseGoogleMapsLocation,validatedGoogleMapsUrl,isShortMapsUrl,type ImportedMapLocation} from "../google-maps-location";

/** Fetch ONLY known Maps shorteners; validate every redirect before following it. */
export async function resolveGoogleMapsLocation(input:string,fetcher:typeof fetch=fetch):Promise<ImportedMapLocation>{
 const direct=parseGoogleMapsLocation(input);if(direct)return direct;
 let url=mapInputUrl(input);const visited=new Set<string>(),signal=AbortSignal.timeout(10000);
 for(let hop=0;hop<5;hop++){
  url=validatedGoogleMapsUrl(url.href);
  if(!isShortMapsUrl(url))throw new MapLocationError("O link final não contém coordenadas. Abra o marcador no Google Maps e copie o link completo.","no_coordinates");
  if(visited.has(url.href))throw new MapLocationError("O link está em um ciclo de redirecionamento.");visited.add(url.href);
  let response:Response;
  try{response=await fetcher(url.href,{method:"GET",redirect:"manual",cache:"no-store",credentials:"omit",headers:{"User-Agent":"Mozilla/5.0 (compatible; OrionMaps/0.4.18)",Accept:"text/html"},signal});}
  catch{throw new MapLocationError("Não foi possível abrir o link curto agora. Tente novamente ou cole o link completo do Google Maps.","network");}
  try{
   if(![301,302,303,307,308].includes(response.status))throw new MapLocationError(response.status===404||response.status===410?"Esse link curto expirou ou não existe. Gere outro link no Google Maps.":"O link não redirecionou para um ponto. Abra-o no Google Maps e copie o endereço completo.","unresolved");
   const location=response.headers.get("location");if(!location)throw new MapLocationError("O link não informou um destino.");
   // URL() handles relative redirects; the allowlist prevents private IPs, consent pages and arbitrary services.
   url=validatedGoogleMapsUrl(new URL(location,url).href);
   const resolved=parseGoogleMapsLocation(url.href);if(resolved)return resolved;
  }finally{await response.body?.cancel().catch(()=>{});}
 }
 throw new MapLocationError("O link excedeu o limite de redirecionamentos. Cole o endereço completo do Google Maps.");
}

/** Compare the browser Origin with the HTTP Host, not Next's normalized localhost URL. */
export function isSameMapOrigin(origin:string|null,host:string|null):boolean{
 if(!origin||!host)return false;
 try{const url=new URL(origin);return url.origin===origin&&url.host===host&&(url.protocol==="https:"||(url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)));}catch{return false;}
}

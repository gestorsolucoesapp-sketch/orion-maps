/** Coordinates only: never imports Google imagery, navigation routes or field boundaries. */
export type ImportedMapLocation={lat:number;lon:number;zoom:number;label:string;kind:"pin"|"view"|"coordinates"};
export const MAX_MAP_LINK_LENGTH=8192;
const NUMBER="[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const PAIR=new RegExp(`^\\s*\\(?\\s*(?:loc:)?(${NUMBER})\\s*[,;]\\s*(${NUMBER})\\s*\\)?\\s*$`,"i");
const GOOGLE_SUFFIXES=new Set(["com","com.br","pt","es","fr","de","it","co.uk","ca","com.au","co.in","co.jp","com.mx","cl","com.ar","com.co","co.nz","nl","be","ch","at","ie"]);
const SHORT_HOSTS=new Set(["maps.app.goo.gl","goo.gl","share.google"]);
export class MapLocationError extends Error { constructor(message:string,public code="invalid"){super(message);this.name="MapLocationError";} }
export function locationPoint(lat:number,lon:number):[number,number]{
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>80||Math.abs(lon)>180)throw new MapLocationError("Coordenadas fora da área suportada: latitude entre 80°S e 80°N, longitude entre −180° e 180°.");
 return [lon,lat];
}
function result(lat:number,lon:number,kind:ImportedMapLocation["kind"],label:string,zoom=17):ImportedMapLocation{
 locationPoint(lat,lon);return {lat,lon,kind,label:label.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,160),zoom:Number.isFinite(zoom)?Math.max(0,Math.min(21,zoom)):17};
}
function pair(value:string):[number,number]|null{
 const match=value.match(PAIR);if(match){const lat=Number(match[1]),lon=Number(match[2]);locationPoint(lat,lon);return [lat,lon];}
 const dms=value.match(/^\s*(\d{1,2})[°º]\s*(\d{1,2})['′]\s*(\d+(?:\.\d+)?)["″]\s*([NS])\s*[,;]?\s*(\d{1,3})[°º]\s*(\d{1,2})['′]\s*(\d+(?:\.\d+)?)["″]\s*([EWO])\s*$/i);
 if(!dms)return null;
 if([Number(dms[2]),Number(dms[3]),Number(dms[6]),Number(dms[7])].some(n=>n>=60))throw new MapLocationError("Minutos e segundos das coordenadas inválidos.");
 const lat=(Number(dms[1])+Number(dms[2])/60+Number(dms[3])/3600)*(dms[4].toUpperCase()==="S"?-1:1),lon=(Number(dms[5])+Number(dms[6])/60+Number(dms[7])/3600)*(/[WO]/i.test(dms[8])?-1:1);locationPoint(lat,lon);return [lat,lon];
}
function decode(value:string){try{return decodeURIComponent(value);}catch{throw new MapLocationError("O link contém uma codificação inválida. Copie-o novamente.");}}
export function validatedGoogleMapsUrl(value:string):URL{
 if(value.length>MAX_MAP_LINK_LENGTH||/[\u0000-\u0020\u007f\\]/.test(value))throw new MapLocationError("Link inválido ou muito longo.");
 let url:URL;try{url=new URL(value);}catch{throw new MapLocationError("Cole um link do Google Maps ou latitude, longitude.");}
 if(url.protocol!=="https:"||url.username||url.password||url.port)throw new MapLocationError("Use um link HTTPS do Google Maps, sem usuário, senha ou porta.");
 const host=url.hostname.toLowerCase(),suffix=host.replace(/^(?:www\.|maps\.)?google\./,"");
 const google=/^(?:www\.|maps\.)?google\./.test(host)&&GOOGLE_SUFFIXES.has(suffix);
 const mapsPath=/^\/maps(?:\/|$)/.test(url.pathname)||(host.startsWith("maps.google.")&&url.pathname==="/");
 const short=host==="maps.app.goo.gl"&&/^\/[A-Za-z0-9_-]{3,200}\/?$/.test(url.pathname)||host==="goo.gl"&&/^\/maps\/[A-Za-z0-9_-]{3,200}\/?$/.test(url.pathname)||host==="share.google"&&/^\/[A-Za-z0-9_-]{3,200}\/?$/.test(url.pathname);
 if(!(google&&mapsPath)&&!short)throw new MapLocationError("Esse endereço não é um link de localização do Google Maps.");
 url.hash="";return url;
}
export function isShortMapsUrl(url:URL){return SHORT_HOSTS.has(url.hostname);}
export function mapInputUrl(input:unknown):URL{
 if(typeof input!=="string"||!input.trim()||input.length>MAX_MAP_LINK_LENGTH)throw new MapLocationError("Cole um link do Google Maps de até 8.192 caracteres.");
 const value=input.trim(),matches=value.match(/https:\/\/[^\s<>"\u201c\u201d]+/gi);
 if(matches?.length===1){const trimmed=matches[0].replace(/[.,;]+$/,"").replace(/\)$/,"");return validatedGoogleMapsUrl(trimmed);}
 if(matches&&matches.length>1)throw new MapLocationError("Cole apenas um link de localização por vez.");
 if(/^(?:www\.|maps\.)?google\.|^maps\.app\.goo\.gl\/|^goo\.gl\/maps\/|^share\.google\//i.test(value))return validatedGoogleMapsUrl("https://"+value);
 return validatedGoogleMapsUrl(value);
}
function singleParam(url:URL,key:string):string|null{const values=[...new Set(url.searchParams.getAll(key))];if(values.length>1)throw new MapLocationError("O link contém localizações conflitantes.");return values[0]??null;}
export function parseGoogleMapsLocation(input:unknown):ImportedMapLocation|null{
 if(typeof input!=="string"||input.length>MAX_MAP_LINK_LENGTH)throw new MapLocationError("Link inválido ou muito longo.");
 const raw=pair(input.trim());if(raw)return result(raw[0],raw[1],"coordinates","Coordenadas informadas");
 let url=mapInputUrl(input);
 for(let i=0;i<3;i++){const nested=singleParam(url,"link")||singleParam(url,"deep_link_id");if(!nested)break;url=validatedGoogleMapsUrl(nested);if(i===2)throw new MapLocationError("O link contém redirecionamentos demais.");}
 if(isShortMapsUrl(url))return null;
 const path=decode(url.pathname),params=url.searchParams;
 if(/\/maps\/(?:dir|d|t)\//.test(path)||["origin","destination","saddr","daddr","waypoints"].some(k=>params.has(k))||params.get("map_action")==="pano"||params.has("pano")||/,[0-9.]+a,/.test(path))throw new MapLocationError("Compartilhe um ponto ou local no Google Maps, não uma rota, mapa personalizado ou Street View.");
 const data=path.match(/\/data=([^?]+)/)?.[1]||singleParam(url,"data")||"";
 const targets=[...data.matchAll(new RegExp(`!3d(${NUMBER})!4d(${NUMBER})(?=!|$)`,"g"))].map(m=>[Number(m[1]),Number(m[2])] as [number,number]);
 const unique=[...new Map(targets.map(p=>[p.join(","),p])).values()];
 if(unique.length>1)throw new MapLocationError("O link contém mais de um ponto. Compartilhe apenas o local desejado.");
 const pathName=path.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1]?.replace(/\+/g," ");
 if(unique.length===1){const [lat,lon]=unique[0];return result(lat,lon,"pin",pathName||"Ponto do Google Maps");}
 if(data.includes("!3d")&&data.includes("!4d"))throw new MapLocationError("As coordenadas do marcador são inválidas.");
 if(params.has("query_place_id")||params.has("place_id")||params.has("cid")||params.has("ftid"))throw new MapLocationError("Esse link identifica um lugar, mas não expõe seu ponto. Abra o local no Google Maps e compartilhe o marcador ou suas coordenadas.","no_coordinates");
 for(const key of ["query","q"]){const value=singleParam(url,key);if(value){const point=pair(value);if(point)return result(point[0],point[1],"pin","Ponto do Google Maps");throw new MapLocationError("O link contém somente um nome ou uma busca. Compartilhe um marcador ou cole as coordenadas do local.","no_coordinates");}}
 if(pathName){const point=pair(pathName);if(point)return result(point[0],point[1],"pin","Ponto do Google Maps");throw new MapLocationError("Não foi possível obter as coordenadas do local. Compartilhe o marcador ou copie latitude e longitude.","no_coordinates");}
 const zoomValue=singleParam(url,"zoom")??singleParam(url,"z"),zoom=zoomValue!==null?Number(zoomValue):17;
 for(const key of ["center","ll"]){const value=singleParam(url,key);if(value){const point=pair(value);if(!point)throw new MapLocationError("Centro do mapa inválido.");return result(point[0],point[1],"view","Centro da visualização",zoom);}}
 const view=path.match(new RegExp(`@(${NUMBER}),(${NUMBER})(?:,(${NUMBER})z)?(?:/|,|$)`));
 if(view)return result(Number(view[1]),Number(view[2]),"view","Centro da visualização",view[3]?Number(view[3]):zoom);
 throw new MapLocationError("Esse link não expõe coordenadas. Abra o ponto no Google Maps e copie o link completo ou latitude e longitude.","no_coordinates");
}

export function validateImportedMapLocation(value:unknown):ImportedMapLocation{
 if(!value||typeof value!=="object")throw new MapLocationError("Localização importada inválida.");const v=value as Record<string,unknown>;
 if(typeof v.lat!=="number"||typeof v.lon!=="number"||typeof v.zoom!=="number"||!Number.isFinite(v.zoom)||v.zoom<0||v.zoom>21||typeof v.label!=="string"||v.label.length>160||!["pin","view","coordinates"].includes(String(v.kind)))throw new MapLocationError("Localização importada inválida.");
 return result(v.lat,v.lon,v.kind as ImportedMapLocation["kind"],v.label,v.zoom);
}

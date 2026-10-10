import { strToU8, zipSync } from "fflate";
import type { Coordinate } from "./flight-plan";
const xml=(s:string)=>s.replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]!));
export type PreviewDetails = { boundary?: Coordinate[]; exclusions?: Coordinate[][]; photos?: Coordinate[] };
export function previewKml(name:string,legs:Coordinate[][],height:number,details:PreviewDetails={}) {
  const coordinates=(points:Coordinate[])=>points.map(p=>`${p[0]},${p[1]},0`).join(" ");
  const line=(label:string,points:Coordinate[],color:string)=>`<Placemark><name>${xml(label)}</name><Style><LineStyle><color>${color}</color><width>2</width></LineStyle></Style><LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>${coordinates(points)}</coordinates></LineString></Placemark>`;
  const boundary=details.boundary&&details.boundary.length>=3?line("Limite da área",[...details.boundary,details.boundary[0]],"ff42a556"):"";
  const exclusions=(details.exclusions??[]).map((ring,i)=>line(`Área isolada ${i+1}`,[...ring,ring[0]],"ff2436b4")).join("");
  const connections=legs.slice(1).map((leg,i)=>legs[i].length&&leg.length?line(`Conexão ${i+1} — verificar obstáculos`,[legs[i][legs[i].length-1],leg[0]],"ff00cfff"):"").join("");
  const photos=(details.photos??[]).map((p,i)=>`<Placemark><name>Foto de referência ${i+1}</name><description>Posição calculada pela sobreposição em terreno plano. Não é disparo temporizado nem comando de câmera.</description><Point><altitudeMode>clampToGround</altitudeMode><coordinates>${coordinates([p])}</coordinates></Point></Placemark>`).join("");
  const extra=`<Folder><name>Área</name>${boundary}${exclusions}</Folder><Folder><name>Conexões propostas — não validadas</name>${connections}</Folder><Folder><name>Fotos de referência por sobreposição</name><visibility>0</visibility>${photos}</Folder>`;
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(name)}</name><description>Orion Maps: revisão cartográfica, não missão executável DJI Fly. Altura informada: ${height} m; desenho sobre o terreno, sem representar altitude real de voo. Conexões propostas não verificam obstáculos. Decolagem e retorno não incluídos. Cobertura e relevo não validados.</description><Style id="route"><LineStyle><color>ff4b78db</color><width>3</width></LineStyle></Style>${legs.map((leg,i)=>`<Placemark><name>Trecho ${i+1}</name><styleUrl>#route</styleUrl><LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>${leg.map(p=>`${p[0]},${p[1]},0`).join(" ")}</coordinates></LineString></Placemark>`).join("")}${extra}</Document></kml>`;
}
export function previewKmz(name:string,legs:Coordinate[][],height:number,details:PreviewDetails={}) {return zipSync({"doc.kml":strToU8(previewKml(name,legs,height,details))});}
export function missionCsv(legs:Coordinate[][],height:number,speed:number,gimbal:number) {
  return "segment,point,longitude_deg,latitude_deg,planned_height_m,speed_m_s,gimbal_deg\r\n"+legs.flatMap((leg,i)=>leg.map((p,j)=>`${i+1},${j+1},${p[0]},${p[1]},${height},${speed},${gimbal}`)).join("\r\n");
}

import { strToU8, zipSync } from "fflate";
import type { Coordinate } from "./flight-plan";
const xml=(s:string)=>s.replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]!));
export function previewKml(name:string,legs:Coordinate[][],height:number) {
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(name)}</name><description>Orion Maps: revisão cartográfica. Não é uma missão executável DJI Fly. Altura planejada: ${height} m; o desenho está sobre o terreno. As conexões entre faixas, decolagem e retorno não estão incluídos.</description><Style id="route"><LineStyle><color>ff4b78db</color><width>3</width></LineStyle></Style>${legs.map((leg,i)=>`<Placemark><name>Trecho ${i+1}</name><styleUrl>#route</styleUrl><LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>${leg.map(p=>`${p[0]},${p[1]},0`).join(" ")}</coordinates></LineString></Placemark>`).join("")}</Document></kml>`;
}
export function previewKmz(name:string,legs:Coordinate[][],height:number) {return zipSync({"doc.kml":strToU8(previewKml(name,legs,height))});}
export function missionCsv(legs:Coordinate[][],height:number,speed:number,gimbal:number) {
  return "segment,point,longitude_deg,latitude_deg,planned_height_m,speed_m_s,gimbal_deg\r\n"+legs.flatMap((leg,i)=>leg.map((p,j)=>`${i+1},${j+1},${p[0]},${p[1]},${height},${speed},${gimbal}`)).join("\r\n");
}

import proj4 from "proj4";
import polygonClipping, {type MultiPolygon} from "polygon-clipping";
const {difference}=polygonClipping;

export type XY = [number, number];
export type RowStatus = "planned" | "planted" | "replant" | "excluded";
export type RowAssignment = {crop:string; variety:string; status:RowStatus; notes:string};
export type AgroSettings = {mode:"planting"|"spraying"; spacing_m:number; bearing_deg:number; end_margin_m:number; application_l_ha:number|null};
export type AgroPlan = {schema_version:1; boundary:XY[]; exclusions:XY[][]; settings:AgroSettings; assignments:Record<string,RowAssignment>};
export type AgroRow = {id:string; number:number; segments:XY[][]; length_m:number; assignment:RowAssignment};
export type AgroCalculation = {epsg:string; rows:AgroRow[]; area_m2:number; usable_area_m2:number; excluded_area_m2:number; length_m:number; active_length_m:number; application_l:number|null; usable:MultiPolygon; warnings:string[]};
export const DEFAULT_AGRO_SETTINGS:AgroSettings = {mode:"planting",spacing_m:3.5,bearing_deg:0,end_margin_m:0,application_l_ha:null};
export const EMPTY_ASSIGNMENT:RowAssignment = {crop:"",variety:"",status:"planned",notes:""};
export const ROW_STATUS_LABELS:Record<RowStatus,string> = {planned:"Planejada",planted:"Plantada",replant:"Replantio",excluded:"Não utilizar"};
const EPS=1e-7;
const cross=(a:XY,b:XY,c:XY)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function on(a:XY,b:XY,p:XY){return Math.abs(cross(a,b,p))<EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;}
function intersects(a:XY,b:XY,c:XY,d:XY){return (cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
const same=(a:XY,b:XY)=>a[0]===b[0]&&a[1]===b[1];
const zone=(longitude:number)=>Math.max(1,Math.min(60,Math.floor((longitude+180)/6)+1));
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Dados do plano inválidos.");return value as Record<string,unknown>;}
function numeric(value:unknown,min:number,max:number,label:string){if(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max)throw Error(`${label}: informe um valor entre ${min} e ${max}.`);return value;}
function text(value:unknown,max:number,label:string){if(typeof value!=="string"||value.length>max)throw Error(`${label} inválido.`);return value.trim();}
export function validAgroPoint(p:unknown):p is XY{return Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==="number"&&Number.isFinite(v))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=75;}
function ring(value:unknown):XY[]{
 if(!Array.isArray(value)||value.length<3||value.length>201||!value.every(validAgroPoint))throw Error("Cada contorno deve ter 3 a 200 pontos em longitude/latitude WGS84, entre 75°S e 75°N.");
 const points=(value as XY[]).map(p=>[...p] as XY);if(same(points[0],points.at(-1)!))points.pop();
 if(points.length<3||points.length>200)throw Error("Contorno incompleto.");return points;
}
export function validateAgroPlan(input:unknown):AgroPlan{
 if(JSON.stringify(input)?.length>450000)throw Error("Plano muito grande. Divida o talhão.");
 const p=object(input);if(p.schema_version!==1)throw Error("Versão de plano não suportada.");
 const boundary=ring(p.boundary);
 if(!Array.isArray(p.exclusions)||p.exclusions.length>20)throw Error("Use até 20 áreas de exclusão.");
 const exclusions=p.exclusions.map(ring),s=object(p.settings);
 if(s.mode!=="planting"&&s.mode!=="spraying")throw Error("Modo inválido.");
 const settings:AgroSettings={mode:s.mode,spacing_m:numeric(s.spacing_m,0.2,100,"Espaçamento"),bearing_deg:numeric(s.bearing_deg,0,359.99,"Rumo"),end_margin_m:numeric(s.end_margin_m,0,100,"Recuo nas pontas"),application_l_ha:s.application_l_ha===null?null:numeric(s.application_l_ha,0.01,10000,"Volume informado")};
 const assignments:Record<string,RowAssignment>={};
 const entries=Object.entries(object(p.assignments)).sort(([a],[b])=>a.localeCompare(b));if(entries.length>2000)throw Error("Limite de 2.000 linhas.");
 for(const [id,value] of entries){
  if(!/^L\d{4}$/.test(id))throw Error("Identificador de linha inválido.");
  const a=object(value);if(!["planned","planted","replant","excluded"].includes(String(a.status)))throw Error("Situação de linha inválida.");
  assignments[id]={crop:text(a.crop,80,"Cultura"),variety:text(a.variety,100,"Variedade"),status:a.status as RowStatus,notes:text(a.notes,300,"Observação")};
 }
 return {schema_version:1,boundary,exclusions,settings,assignments};
}
function signedArea(points:XY[]){const o=points[0];return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+(p[0]-o[0])*(q[1]-o[1])-(q[0]-o[0])*(p[1]-o[1]);},0)/2;}
function multiArea(polys:MultiPolygon){return polys.reduce((sum,rings)=>sum+rings.reduce((a,r,i)=>a+(i===0?1:-1)*Math.abs(signedArea(r)),0),0);}
function checkRing(points:XY[]){
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(b[0]-a[0],b[1]-a[1])<0.05)throw Error("Remova vértices repetidos ou muito próximos.");
  for(let j=i+1;j<points.length;j++)if(j!==i+1&&!(i===0&&j===points.length-1)&&intersects(a,b,points[j],points[(j+1)%points.length]))throw Error("O contorno cruza a si mesmo. Redesenhe sem cruzamentos.");
 }
 if(Math.abs(signedArea(points))<1)throw Error("Cada área deve possuir pelo menos 1 m².");
}
/** Parallel centerlines in WGS84/UTM, clipped to the usable polygon. Not an executable flight mission. */
export function calculateAgroPlan(input:AgroPlan):AgroCalculation{
 const p=validateAgroPlan(input),z=zone(p.boundary[0][0]),south=p.boundary[0][1]<0;
 const epsg=`EPSG:${(south?32700:32600)+z}`;
 const crs=`+proj=utm +zone=${z} ${south?"+south ":""}+datum=WGS84 +units=m +no_defs`;
 const converter=proj4("EPSG:4326",crs);
 const all=[...p.boundary,...p.exclusions.flat()];
 if(all.some(c=>zone(c[0])!==z||(c[1]<0)!==south))throw Error("Divida o planejamento por zona UTM e hemisfério.");
 const toMetric=(c:XY)=>converter.forward(c) as XY,toGeo=(c:XY)=>converter.inverse(c) as XY;
 const outer=p.boundary.map(toMetric),holes=p.exclusions.map(r=>r.map(toMetric));
 if(all.map(toMetric).some(c=>Math.hypot(c[0]-outer[0][0],c[1]-outer[0][1])>10000))throw Error("Divida a área em talhões de até 10 km de extensão.");
 [outer,...holes].forEach(checkRing);
 const area=Math.abs(signedArea(outer));
 const usable=holes.length?difference([outer],...holes.map(r=>[r])):[[[...outer,outer[0]]]] as MultiPolygon;
 const usableArea=multiArea(usable);if(usableArea<1)throw Error("As exclusões cobrem toda a área útil.");
 const a=p.settings.bearing_deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const rotate=([x,y]:XY):XY=>[(x-outer[0][0])*c-(y-outer[0][1])*s,(x-outer[0][0])*s+(y-outer[0][1])*c];
 const unrotate=([u,v]:XY):XY=>[u*c+v*s+outer[0][0],-u*s+v*c+outer[0][1]];
 const projected=usable.map(poly=>poly.map(r=>r.map(rotate)));
 const values=projected.flat(2).map(c=>c[0]),min=Math.min(...values),max=Math.max(...values),span=max-min;
 const step=p.settings.spacing_m;
 const count=Math.max(1,Math.floor((span+1e-6)/step));if(count>2000)throw Error("A grade excede 2.000 linhas. Divida o talhão ou aumente o espaçamento.");
 const start=(min+max)/2-(count-1)*step/2;
 const rows:AgroRow[]=[];let segmentCount=0;
 for(let i=0;i<count;i++){
  const u=start+i*step,segments:XY[][]=[];let length=0;
  for(const poly of projected){
   const crossings:number[]=[];
   for(const r of poly)for(let j=0;j<r.length-1;j++){
    const v=r[j],w=r[j+1];if((v[0]<=u&&w[0]>u)||(w[0]<=u&&v[0]>u))crossings.push(v[1]+(u-v[0])*(w[1]-v[1])/(w[0]-v[0]));
   }
   crossings.sort((x,y)=>x-y);if(crossings.length%2)throw Error("Não foi possível recortar uma faixa. Revise o contorno.");
   for(let j=0;j+1<crossings.length;j+=2){
    const from=crossings[j]+p.settings.end_margin_m,to=crossings[j+1]-p.settings.end_margin_m;
    if(to-from<0.05)continue;
    segments.push([toGeo(unrotate([u,from])),toGeo(unrotate([u,to]))]);length+=to-from;segmentCount++;
    if(segmentCount>10000)throw Error("Excesso de segmentos. Simplifique as exclusões.");
   }
  }
  if(!segments.length)continue;
  if(i%2){segments.reverse();segments.forEach(seg=>seg.reverse());}
  const id=`L${String(i+1).padStart(4,"0")}`;
  rows.push({id,number:i+1,segments,length_m:length,assignment:p.assignments[id]||{...EMPTY_ASSIGNMENT}});
 }
 if(!rows.length)throw Error("Nenhuma linha após o recorte. Revise espaçamento, rumo e recuo.");
 const ids=new Set(rows.map(r=>r.id));if(Object.keys(p.assignments).some(id=>!ids.has(id)))throw Error("A grade mudou. Reatribua culturas às linhas regeneradas.");
 const warnings=["Simulação geométrica em WGS84/UTM. Não considera relevo, curvas de nível, vento, deriva, manobras, autonomia ou obstáculos não desenhados.","As exclusões recortam as linhas centrais; não modelam a faixa molhada. Delimite as margens necessárias. Não é uma missão executável para o drone."];
 return {epsg,rows,area_m2:area,usable_area_m2:usableArea,excluded_area_m2:Math.max(0,area-usableArea),length_m:rows.reduce((v,r)=>v+r.length_m,0),active_length_m:rows.filter(r=>r.assignment.status!=="excluded").reduce((v,r)=>v+r.length_m,0),application_l:p.settings.mode==="spraying"&&p.settings.application_l_ha!==null?usableArea/10000*p.settings.application_l_ha:null,usable:usable.map(poly=>poly.map(r=>r.map(toGeo))),warnings};
}
export function cropColor(crop:string,status:RowStatus):string{
 if(status==="excluded")return "#7b8790";if(status==="replant")return "#d16412";
 const known:Record<string,string>={"café":"#177b45","soja":"#9b8020","milho":"#d09a12","cana":"#629124","eucalipto":"#208987"};
 return known[crop.toLocaleLowerCase("pt-BR")]||(crop?"#6f57a5":"#237abb");
}
export function exportAgroGeoJSON(name:string,plan:AgroPlan,result:AgroCalculation):GeoJSON.FeatureCollection{
 const closed=(r:XY[])=>[...r,r[0]];
 return {type:"FeatureCollection",features:[
  {type:"Feature",properties:{kind:"field",name,calculation_crs:result.epsg,area_m2:result.area_m2,usable_area_m2:result.usable_area_m2,simulation_only:true},geometry:{type:"Polygon",coordinates:[closed(plan.boundary)]}},
  ...plan.exclusions.map((r,i):GeoJSON.Feature=>({type:"Feature",properties:{kind:"exclusion",name:`Exclusão ${i+1}`},geometry:{type:"Polygon",coordinates:[closed(r)]}})),
  ...result.rows.map((r):GeoJSON.Feature=>({type:"Feature",id:r.id,properties:{kind:"row",row_id:r.id,number:r.number,length_m:r.length_m,...r.assignment,color:cropColor(r.assignment.crop,r.assignment.status),simulation_only:true,mode:plan.settings.mode},geometry:{type:"MultiLineString",coordinates:r.segments}})),
 ]};
}
export function agroCsv(result:AgroCalculation):string{
 const cell=(value:string|number)=>{let s=String(value);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return '\uFEFF'+[['Linha','Cultura','Variedade','Situação','Comprimento UTM (m)','Observação'],...result.rows.map(r=>[r.id,r.assignment.crop,r.assignment.variety,ROW_STATUS_LABELS[r.assignment.status],r.length_m.toFixed(2),r.assignment.notes])].map(row=>row.map(cell).join(';')).join('\r\n');
}
export function importAgroGeometry(value:unknown):{boundary:XY[];exclusions:XY[][]}{
 const o=object(value);if(o.type==="FeatureCollection"){if(!Array.isArray(o.features)||o.features.length!==1)throw Error("Importe um GeoJSON com um único polígono de talhão.");return importAgroGeometry(o.features[0]);}
 if(o.type==="Feature")return importAgroGeometry(o.geometry);
 if(o.type!=="Polygon"||!Array.isArray(o.coordinates)||!o.coordinates.length)throw Error("Use um Polygon GeoJSON em WGS84. Para um plano Orion, importe o JSON editável.");
 const [boundary,...exclusions]=o.coordinates.map(ring);return {boundary,exclusions};
}

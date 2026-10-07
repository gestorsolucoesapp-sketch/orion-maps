import geo from "geographiclib-geodesic";
export type MeasurePoint=[number,number];
export type MeasureDrawing={kind:"path"|"polygon";points:MeasurePoint[]};
export type Measurement=MeasureDrawing&{schema_version:1};
export type MeasureMetrics={distance_m:number;perimeter_m:number|null;area_m2:number|null;issue:string;complete:boolean};
export const MEASUREMENT_METHOD="GeographicLib 2.2.0 / WGS84 ellipsoid / horizontal";
export const MAX_MEASURE_POINTS=200;
const earth=geo.Geodesic.WGS84;
export function isMeasurePoint(v:unknown):v is MeasurePoint{return Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==="number"&&Number.isFinite(n))&&Math.abs(v[0])<=180&&Math.abs(v[1])<=80;}
export function measureDistance(a:MeasurePoint,b:MeasurePoint){const d=earth.Inverse(a[1],a[0],b[1],b[0]).s12;if(typeof d!=="number"||!Number.isFinite(d))throw Error("Distância inválida.");return d;}
export function measureMidpoint(a:MeasurePoint,b:MeasurePoint):MeasurePoint{const d=earth.Inverse(a[1],a[0],b[1],b[0]),m=earth.Direct(a[1],a[0],d.azi1!,d.s12!/2);return [m.lon2!,m.lat2!];}
export function validateMeasureDrawing(v:unknown):MeasureDrawing{
 if(!v||typeof v!=="object")throw Error("Medição inválida.");const d=v as Record<string,unknown>;
 if(d.kind!=="path"&&d.kind!=="polygon")throw Error("Escolha Caminho ou Polígono.");
 if(!Array.isArray(d.points)||d.points.length>200||!d.points.every(isMeasurePoint))throw Error("Use até 200 pontos WGS84, entre 80°S e 80°N.");
 const points=(d.points as MeasurePoint[]).map(p=>[...p] as MeasurePoint);
 if(d.kind==="polygon"&&points.length>1&&points[0][0]===points.at(-1)![0]&&points[0][1]===points.at(-1)![1])points.pop();
 for(const p of points){if(Math.abs(p[0]-points[0][0])>180)throw Error("Divida contornos que cruzam o antimeridiano.");if(measureDistance(points[0],p)>100000)throw Error("Cada ponto deve ficar a até 100 km do primeiro. Divida a medição.");}
 return {kind:d.kind,points};
}
const cross=(a:MeasurePoint,b:MeasurePoint,c:MeasurePoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(a:MeasurePoint,b:MeasurePoint,p:MeasurePoint)=>Math.abs(cross(a,b,p))<1e-6&&p[0]>=Math.min(a[0],b[0])-1e-8&&p[0]<=Math.max(a[0],b[0])+1e-8&&p[1]>=Math.min(a[1],b[1])-1e-8&&p[1]<=Math.max(a[1],b[1])+1e-8;
const crosses=(a:MeasurePoint,b:MeasurePoint,c:MeasurePoint,d:MeasurePoint)=>(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
export function measureDrawing(input:MeasureDrawing):MeasureMetrics{
 const d=validateMeasureDrawing(input),p=d.points;let distance_m=0;
 for(let i=1;i<p.length;i++)distance_m+=measureDistance(p[i-1],p[i]);
 const base:MeasureMetrics={distance_m,perimeter_m:null,area_m2:null,issue:"",complete:false};
 if(p.length<(d.kind==="path"?2:3))return base;
 const edges=d.kind==="polygon"?[...p,p[0]]:p;
 for(let i=1;i<edges.length;i++)if(measureDistance(edges[i-1],edges[i])<0.01)return {...base,issue:"Remova vértices repetidos ou separados por menos de 1 cm."};
 if(d.kind==="path")return {...base,complete:true};
 // The local plane is ONLY used to detect crossing edges. Metrics use the ellipsoid.
 const local=p.map((c):MeasurePoint=>{const a=earth.Inverse(p[0][1],p[0][0],c[1],c[0]);return [a.s12!*Math.sin(a.azi1!*Math.PI/180),a.s12!*Math.cos(a.azi1!*Math.PI/180)];});
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){if(j===i+1||(i===0&&j===p.length-1))continue;if(crosses(local[i],local[(i+1)%p.length],local[j],local[(j+1)%p.length]))return {...base,issue:"O contorno cruza a si mesmo. Ajuste os vértices para medir a área."};}
 const poly=earth.Polygon(false);p.forEach(c=>poly.AddPoint(c[1],c[0]));const result=poly.Compute(false,true),area=Math.abs(result.area!);
 if(!Number.isFinite(area)||area<0.01)return {...base,issue:"O polígono precisa delimitar uma área, não apenas uma linha."};
 return {distance_m,perimeter_m:result.perimeter,area_m2:area,issue:"",complete:true};
}
export function requireMeasurement(v:unknown):Measurement{if(!v||typeof v!=="object"||(v as {schema_version?:unknown}).schema_version!==1)throw Error("Versão de medição inválida.");const d=validateMeasureDrawing(v),m=measureDrawing(d);if(!m.complete)throw Error(m.issue||"Marque pelo menos 2 pontos no caminho ou 3 no polígono.");return {schema_version:1,...d};}
export type AreaUnit="m2"|"ha"|"km2";
export type DistanceUnit="m"|"km";
export const areaUnits={m2:{label:"m²",factor:1},ha:{label:"ha",factor:10000},km2:{label:"km²",factor:1000000}};
export const distanceUnits={m:{label:"m",factor:1},km:{label:"km",factor:1000}};
export function measureNumber(v:number|null,factor=1){return v===null?"—":(v/factor).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:factor>1?4:2});}
export function measurementGeoJSON(name:string,input:Measurement):GeoJSON.Feature{const d=requireMeasurement(input),m=measureDrawing(d);return {type:"Feature",properties:{name,kind:d.kind,method:MEASUREMENT_METHOD,horizontal:true,distance_m:d.kind==="path"?m.distance_m:null,perimeter_m:m.perimeter_m,area_m2:m.area_m2,terrain_adjusted:false},geometry:d.kind==="path"?{type:"LineString",coordinates:d.points}:{type:"Polygon",coordinates:[[...d.points,d.points[0]]]}};}

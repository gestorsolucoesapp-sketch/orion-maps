import {unzipSync} from "fflate";
import type {Coordinate} from "./flight-plan";
import {buildFlightSimulation,flightDistance,interpolateFlight,type FlightSimulation,type SimulatedPhoto} from "./flight-simulation.ts";
import type {CaptureMode,CaptureRange} from "./photo-mission";

const KML="http://www.opengis.net/kml/2.2";
const WPML=new Set(["http://www.dji.com/wpmz/1.0.2","http://www.uav.com/wpmz/1.0.2"]);
const MAX_KMZ_BYTES=5_000_000,MAX_XML_BYTES=2_000_000,MAX_WAYPOINTS=500;
export type KmzWaypoint={index:number;point:Coordinate;height:number;speed:number};
export type KmzPhotoAction={start:number;end:number;trigger:string;interval:number};
export type InspectedMission={kind:"mission";name:string;waypoints:KmzWaypoint[];photoActions:KmzPhotoAction[];finishAction:string;droneEnum:string;templateWaypoints:number|null;integrityIssues:string[];notes:string[]};
export type InspectedVisualization={kind:"visualization";name:string;route:Coordinate[];notes:string[]};
export type InspectedKmz=InspectedMission|InspectedVisualization;
export type ExpectedKmz={route:Coordinate[];height:number;speed:number;captureMode:CaptureMode;interval:number;captureRanges:CaptureRange[]};

function child(parent:Element,local:string,namespace:"kml"|"wpml"):Element|undefined{
 return Array.from(parent.children).find(item=>item.localName===local&&(namespace==="kml"?item.namespaceURI===KML:WPML.has(item.namespaceURI||"")));
}
function descendants(parent:Element,local:string,namespace:"kml"|"wpml"):Element[]{
 return Array.from(parent.getElementsByTagNameNS("*",local)).filter(item=>namespace==="kml"?item.namespaceURI===KML:WPML.has(item.namespaceURI||""));
}
function required(parent:Element,local:string,namespace:"kml"|"wpml"):Element{
 const value=child(parent,local,namespace);if(!value)throw Error(`KMZ sem ${local}.`);return value;
}
function numberText(parent:Element,local:string,namespace:"kml"|"wpml",integer=false):number{
 const text=required(parent,local,namespace).textContent?.trim()||"",value=Number(text);
 if(!text||!Number.isFinite(value)||(integer&&!Number.isInteger(value)))throw Error(`Valor inválido de ${local} no KMZ.`);
 return value;
}
function pointText(text:string):Coordinate{
 const fields=text.trim().split(","),lon=Number(fields[0]),lat=Number(fields[1]);
 if(fields.length<2||fields.length>3||!fields[0]||!fields[1]||!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>75)throw Error("Coordenada inválida no KMZ.");
 return [lon,lat];
}
function parseXml(bytes:Uint8Array,label:string):Document{
 if(bytes.length>MAX_XML_BYTES)throw Error(`${label} excede 2 MB.`);
 const xml=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 if(/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml))throw Error(`${label} contém declaração XML não permitida.`);
 const doc=new DOMParser().parseFromString(xml,"application/xml");
 if(doc.getElementsByTagName("parsererror").length||doc.documentElement?.localName!=="kml"||doc.documentElement.namespaceURI!==KML)throw Error(`${label} não é um KML válido.`);
 return doc;
}
function missionWaypoints(doc:Document,template=false):{waypoints:KmzWaypoint[];actions:KmzPhotoAction[]}{
 const folders=descendants(doc.documentElement,"Folder","kml");
 const marks=folders.flatMap(folder=>Array.from(folder.children).filter(item=>item.localName==="Placemark"&&item.namespaceURI===KML&&child(item,"Point","kml")));
 if(marks.length>MAX_WAYPOINTS)throw Error("KMZ acima de 500 waypoints.");
 if(!marks.length)return {waypoints:[],actions:[]};
 const waypoints:KmzWaypoint[]=[],actions:KmzPhotoAction[]=[];
 for(const mark of marks){
  const point=pointText(required(required(mark,"Point","kml"),"coordinates","kml").textContent||"");
  const index=numberText(mark,"index","wpml",true);
  const heightTag=child(mark,template?"height":"executeHeight","wpml");
  const speedTag=child(mark,"waypointSpeed","wpml");
  const height=heightTag?Number(heightTag.textContent?.trim()):NaN;
  const speed=speedTag?Number(speedTag.textContent?.trim()):NaN;
  if(!template&&(!Number.isFinite(height)||!Number.isFinite(speed)))throw Error(`WP ${index+1} sem altura ou velocidade válidas.`);
  waypoints.push({index,point,height,speed});
  if(template)continue;
  for(const group of Array.from(mark.children).filter(item=>item.localName==="actionGroup"&&WPML.has(item.namespaceURI||""))){
   const takePhoto=descendants(group,"actionActuatorFunc","wpml").some(item=>item.textContent?.trim()==="takePhoto");
   if(!takePhoto)continue;
   const trigger=required(group,"actionTrigger","wpml");
   const triggerType=required(trigger,"actionTriggerType","wpml").textContent?.trim()||"";
   const parameter=child(trigger,"actionTriggerParam","wpml")?.textContent?.trim();
   const interval=parameter?Number(parameter):0;
   if(!Number.isFinite(interval))throw Error("Intervalo inválido em ação de foto.");
   actions.push({start:numberText(group,"actionGroupStartIndex","wpml",true),end:numberText(group,"actionGroupEndIndex","wpml",true),trigger:triggerType,interval});
  }
 }
 return {waypoints,actions};
}
export function inspectKmz(bytes:Uint8Array):InspectedKmz{
 if(!(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>MAX_KMZ_BYTES)throw Error("Abra um KMZ de até 5 MB.");
 let entries=0;const seen=new Set<string>();
 const files=unzipSync(bytes,{filter:file=>{
  if(++entries>64)throw Error("KMZ contém arquivos demais.");
  const wanted=["wpmz/template.kml","wpmz/waylines.wpml","doc.kml"].includes(file.name);
  if(wanted&&(seen.has(file.name)||file.originalSize>MAX_XML_BYTES))throw Error("KMZ contém XML repetido ou grande demais.");
  if(wanted)seen.add(file.name);
  return wanted;
 }});
 const template=files["wpmz/template.kml"],waylines=files["wpmz/waylines.wpml"];
 if(!!template!==!!waylines)throw Error("Missão incompleta: template.kml e waylines.wpml são necessários.");
 if(!template&&!waylines){
  const bytes=files["doc.kml"];if(!bytes)throw Error("KMZ sem KML de missão ou visualização.");
  const doc=parseXml(bytes,"doc.kml"),name=(descendants(doc.documentElement,"name","kml")[0]?.textContent?.trim()||"Visualização KML").slice(0,120);
  const route:Coordinate[]=[];
  for(const mark of descendants(doc.documentElement,"Placemark","kml")){
   const title=child(mark,"name","kml")?.textContent?.trim()||"";
   if(!/^Trecho \d+$/i.test(title))continue;
   const line=child(mark,"LineString","kml"),coordinates=line&&child(line,"coordinates","kml")?.textContent;
   if(coordinates)route.push(...coordinates.trim().split(/\s+/).map(pointText));
   if(route.length>10000)throw Error("Visualização acima de 10.000 coordenadas.");
  }
  return {kind:"visualization",name,route,notes:["doc.kml contém desenho para revisão; não há template.kml, waylines.wpml nem ações executáveis de foto."]};
 }
 const templateDoc=parseXml(template,"template.kml"),waylinesDoc=parseXml(waylines,"waylines.wpml");
 const {waypoints,actions}=missionWaypoints(waylinesDoc);
 if(waypoints.length<2)throw Error("waylines.wpml não contém pelo menos dois waypoints.");
 const templatePoints=missionWaypoints(templateDoc,true).waypoints;
 const integrityIssues:string[]=[],notes:string[]=[];
 waypoints.forEach((point,i)=>{if(point.index!==i)integrityIssues.push(`Ordem do waylines: posição ${i+1} tem índice ${point.index}.`);});
 if(templatePoints.length){
  if(templatePoints.length!==waypoints.length)integrityIssues.push(`Template tem ${templatePoints.length} pontos; waylines tem ${waypoints.length}.`);
  else templatePoints.forEach((point,i)=>{if(point.index!==waypoints[i].index||flightDistance(point.point,waypoints[i].point)>.02)integrityIssues.push(`Template e waylines divergem no WP ${i+1}.`);});
 }else notes.push("O template não lista waypoints; a sequência foi lida de waylines.wpml.");
 const config=descendants(waylinesDoc.documentElement,"missionConfig","wpml")[0];
 const templateConfig=descendants(templateDoc.documentElement,"missionConfig","wpml")[0];
 if(!config||!templateConfig)throw Error("KMZ sem missionConfig nos dois XMLs.");
 const finishAction=child(config,"finishAction","wpml")?.textContent?.trim()||"não informado";
 const droneEnum=descendants(config,"droneEnumValue","wpml")[0]?.textContent?.trim()||"não informado";
 for(const field of ["finishAction","globalTransitionalSpeed","droneEnumValue"]){
  const a=descendants(templateConfig,field,"wpml")[0]?.textContent?.trim(),b=descendants(config,field,"wpml")[0]?.textContent?.trim();
  if(a!==b)integrityIssues.push(`Configuração ${field} diverge entre template e waylines.`);
 }
 const ordered=[...actions].sort((a,b)=>a.start-b.start||a.end-b.end);
 ordered.forEach((action,i)=>{
  if(action.start<0||action.start>=action.end||action.end>=waypoints.length)integrityIssues.push(`Ação de foto ${i+1} fora dos limites dos waypoints.`);
  if(i&&action.start<=ordered[i-1].end)integrityIssues.push(`Ações de foto ${i} e ${i+1} se sobrepõem.`);
  if(["multipleTiming","multipleDistance"].includes(action.trigger)&&action.interval<=0)integrityIssues.push(`Intervalo inválido na ação de foto ${i+1}.`);
 });
 if(!actions.length)notes.push("Nenhuma ação takePhoto encontrada; o arquivo não especifica captura automática.");
 notes.push("O KMZ não contém o Home real, relevo, obstáculos, firmware ou confirmação de disparos físicos.");
 return {kind:"mission",name:(descendants(waylinesDoc.documentElement,"name","kml")[0]?.textContent?.trim()||"Missão KMZ").slice(0,120),waypoints,photoActions:ordered,finishAction,droneEnum,templateWaypoints:templatePoints.length||null,integrityIssues,notes};
}
export function compareKmzToPlan(file:InspectedKmz,expected:ExpectedKmz):string[]{
 const issues:string[]=[],actual=file.kind==="mission"?file.waypoints.map(point=>point.point):file.route;
 if(actual.length!==expected.route.length)issues.push(`Quantidade: KMZ ${actual.length}; plano ${expected.route.length}.`);
 for(let i=0;i<Math.min(actual.length,expected.route.length);i++){
  if(flightDistance(actual[i],expected.route[i])>.02){issues.push(`Coordenada ou ordem diferente no WP ${i+1}.`);if(issues.length>=12)break;}
 }
 if(file.kind==="visualization")return issues;
 let indexReported=false,heightReported=false,speedReported=false;
 for(let i=0;i<file.waypoints.length;i++){
  const waypoint=file.waypoints[i];
  if(!indexReported&&waypoint.index!==i){issues.push(`Índice diferente no WP ${i+1}.`);indexReported=true;}
  if(!heightReported&&Math.abs(waypoint.height-expected.height)>1e-6){issues.push(`Altura diferente no WP ${i+1}: KMZ ${waypoint.height} m; plano ${expected.height} m.`);heightReported=true;}
  if(!speedReported&&Math.abs(waypoint.speed-expected.speed)>1e-6){issues.push(`Velocidade diferente no WP ${i+1}: KMZ ${waypoint.speed} m/s; plano ${expected.speed} m/s.`);speedReported=true;}
  if(indexReported&&heightReported&&speedReported)break;
 }
 const wanted=expected.captureMode==="manual"?[]:expected.captureRanges.map(range=>({...range,trigger:expected.captureMode==="time"?"multipleTiming":"multipleDistance",interval:expected.interval}));
 if(JSON.stringify(file.photoActions)!==JSON.stringify(wanted))issues.push(`Ações de fotos diferentes: KMZ ${file.photoActions.length} grupo(s); plano ${wanted.length}. Confira trechos, gatilhos e intervalos.`);
 return issues;
}
export function buildKmzSimulation(file:InspectedMission):FlightSimulation{
 if(file.integrityIssues.length)throw Error("Corrija as divergências internas do KMZ antes de simular.");
 const route=file.waypoints.map(waypoint=>waypoint.point),height=file.waypoints[0].height,speed=file.waypoints[0].speed;
 if(file.waypoints.some(waypoint=>Math.abs(waypoint.height-height)>1e-6||Math.abs(waypoint.speed-speed)>1e-6))throw Error("Este KMZ varia altura ou velocidade por waypoint; a prévia de velocidade constante não pode representá-lo fielmente.");
 const triggers=new Set(file.photoActions.map(action=>action.trigger));
 if([...triggers].some(trigger=>!["multipleTiming","multipleDistance"].includes(trigger))||triggers.size>1)throw Error("Este KMZ contém gatilhos de foto mistos ou não suportados pela prévia.");
 const first=file.photoActions[0],mode:CaptureMode=!first?"manual":first.trigger==="multipleDistance"?"distance":"time";
 const captureEdges=route.slice(1).map((_,i)=>file.photoActions.some(action=>i>=action.start&&i<action.end));
 const simulation=buildFlightSimulation({legs:[route],captureEdges,height,speed,captureMode:mode,photoInterval:mode==="time"?first.interval:3,captureDistance:mode==="distance"?first.interval:12,home:null,includeTakeoff:false,turnSeconds:0,returnHome:false});
 const photos:SimulatedPhoto[]=[];
 for(const action of file.photoActions){
  const segments=simulation.segments.filter(segment=>segment.phase==="survey"&&segment.waypoint>=action.start+2&&segment.waypoint<=action.end+1);
  const spans=segments.map(segment=>action.trigger==="multipleDistance"?segment.distanceEnd-segment.distanceStart:segment.end-segment.start);
  const total=spans.reduce((sum,span)=>sum+span,0),count=Math.floor((total+1e-7)/action.interval)+1;
  if(photos.length+count>30000)throw Error("Mais de 30.000 posições de foto no KMZ.");
  for(let i=0;i<count&&segments.length;i++){
   let remaining=Math.min(total,i*action.interval),index=0;
   while(index<spans.length-1&&remaining>spans[index]+1e-8){remaining-=spans[index++];}
   const segment=segments[index],fraction=Math.max(0,Math.min(1,remaining/spans[index]));
   photos.push({time:segment.start+(segment.end-segment.start)*fraction,position:interpolateFlight(segment.from,segment.to,fraction),number:photos.length+1});
  }
 }
 simulation.photos=photos.sort((a,b)=>a.time-b.time).map((photo,i)=>({...photo,number:i+1}));
 return simulation;
}

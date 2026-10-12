import {strToU8,zipSync} from "fflate";
import {flightDistance} from "./flight-simulation.ts";
import type {Coordinate} from "./flight-plan";
export type CaptureMode="manual"|"time"|"distance";
export type CaptureRange={start:number;end:number};
export type PhotoMission={name:string;route:Coordinate[];captureRanges?:CaptureRange[];height:number;speed:number;gimbal:number;captureMode:CaptureMode;interval:number};
// One action stays active from the first capture leg to the last, including connections.
export function photoMissionRoute(legs:Coordinate[][],captureLegs:boolean[]){
 if(!legs.length||legs.length!==captureLegs.length)throw Error("Trechos de captura inválidos.");
 const route:Coordinate[]=[];let first=-1,last=-1;
 for(let i=0;i<legs.length;i++){
  const leg=legs[i];
  if(leg.length<2||typeof captureLegs[i]!=="boolean")throw Error("Trechos de captura inválidos.");
  const start=route.length;
  route.push(...leg);
  if(captureLegs[i]){if(first<0)first=start;last=route.length-1;}
 }
 if(first<0)throw Error("A rota não contém trecho de captura.");
 return {route,captureRanges:[{start:first,end:last}]};
}
export function estimatePhotoCount(legs:Coordinate[][],captureLegs:boolean[],speed:number,mode:CaptureMode,interval:number){
 if(!Number.isFinite(speed)||speed<=0||!Number.isFinite(interval)||interval<=0) return 0;
 const {route,captureRanges}=photoMissionRoute(legs,captureLegs),{start,end}=captureRanges[0];
 const meters=route.slice(start+1,end+1).reduce((sum,point,i)=>sum+flightDistance(route[start+i],point),0);
 return meters>0?Math.floor((meters/(mode==="distance"?interval:speed*interval))+1e-7)+1:0;
}
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
const tag=(key:string,value:string|number)=>`<wpml:${key}>${value}</wpml:${key}>`;
export function photoMissionKmz(p:PhotoMission){
 if(p.route.length<2||p.route.length>200||p.route.some(c=>c.length!==2||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>75))throw Error("Rota inválida ou acima de 200 pontos.");
 if(!Number.isFinite(p.height)||p.height<1||p.height>500||!Number.isFinite(p.speed)||p.speed<=0||p.speed>15||!Number.isFinite(p.gimbal)||p.gimbal< -90||p.gimbal>0)throw Error("Parâmetros de voo inválidos.");
 if(!["manual","time","distance"].includes(p.captureMode)||!Number.isFinite(p.interval)||p.interval<=0||p.interval>500)throw Error("Configuração de captura inválida.");
 const ranges=p.captureMode==="manual"?[]:p.captureRanges;
 if(p.captureMode!=="manual"&&(!Array.isArray(ranges)||ranges.length!==1||ranges.some(range=>!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<0||range.start>=range.end||range.end>=p.route.length)))throw Error("Intervalos de captura inválidos.");
 const config=`<wpml:missionConfig>${tag("flyToWaylineMode","safely")}${tag("finishAction","goHome")}${tag("exitOnRCLost","executeLostAction")}${tag("executeRCLostAction","goBack")}${tag("globalTransitionalSpeed",p.speed)}<wpml:droneInfo>${tag("droneEnumValue",68)}${tag("droneSubEnumValue",0)}</wpml:droneInfo></wpml:missionConfig>`;
 const photoAction=(ranges??[]).map(range=>`<wpml:actionGroup>${tag("actionGroupId",2)}${tag("actionGroupStartIndex",range.start)}${tag("actionGroupEndIndex",range.end)}${tag("actionGroupMode","sequence")}<wpml:actionTrigger>${tag("actionTriggerType",p.captureMode==="time"?"multipleTiming":"multipleDistance")}${tag("actionTriggerParam",p.interval)}</wpml:actionTrigger><wpml:action>${tag("actionId",2)}${tag("actionActuatorFunc","takePhoto")}<wpml:actionActuatorFuncParam>${tag("payloadPositionIndex",0)}</wpml:actionActuatorFuncParam></wpml:action></wpml:actionGroup>`)[0]??"";
 const gimbalStart=ranges?.[0]?.start??0;
 const gimbalAction=`<wpml:actionGroup>${tag("actionGroupId",1)}${tag("actionGroupStartIndex",gimbalStart)}${tag("actionGroupEndIndex",gimbalStart)}${tag("actionGroupMode","parallel")}<wpml:actionTrigger>${tag("actionTriggerType","reachPoint")}</wpml:actionTrigger><wpml:action>${tag("actionId",1)}${tag("actionActuatorFunc","gimbalRotate")}<wpml:actionActuatorFuncParam>${tag("gimbalHeadingYawBase","aircraft")}${tag("gimbalRotateMode","absoluteAngle")}${tag("gimbalPitchRotateEnable",1)}${tag("gimbalPitchRotateAngle",p.gimbal)}${tag("gimbalRollRotateEnable",0)}${tag("gimbalRollRotateAngle",0)}${tag("gimbalYawRotateEnable",0)}${tag("gimbalYawRotateAngle",0)}${tag("gimbalRotateTimeEnable",0)}${tag("gimbalRotateTime",0)}${tag("payloadPositionIndex",0)}</wpml:actionActuatorFuncParam></wpml:action></wpml:actionGroup>`;
 const placemarks=p.route.map((c,i)=>`<Placemark><Point><coordinates>${c[0]},${c[1]}</coordinates></Point>${tag("index",i)}${tag("executeHeight",p.height)}${tag("waypointSpeed",p.speed)}<wpml:waypointHeadingParam>${tag("waypointHeadingMode","followWayline")}</wpml:waypointHeadingParam><wpml:waypointTurnParam>${tag("waypointTurnMode","toPointAndStopWithDiscontinuityCurvature")}</wpml:waypointTurnParam>${i===gimbalStart?gimbalAction:""}<wpml:waypointGimbalHeadingParam>${tag("waypointGimbalPitchAngle",p.gimbal)}</wpml:waypointGimbalHeadingParam>${i===ranges?.[0]?.start?photoAction:""}</Placemark>`).join("");
 const folder=`<Folder>${tag("templateType","waypoint")}${tag("templateId",0)}${tag("executeHeightMode","relativeToStartPoint")}${tag("waylineId",0)}${tag("autoFlightSpeed",p.speed)}${placemarks}</Folder>`;
 const header=`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2"><Document>${tag("author","fly")}<name>${esc(p.name.slice(0,120))}</name>${config}`;
 const waylines=header+folder+"</Document></kml>";
 const template=header.replace(config,config)+folder+"</Document></kml>";
 return zipSync({"wpmz/template.kml":strToU8(template),"wpmz/waylines.wpml":strToU8(waylines)});
}

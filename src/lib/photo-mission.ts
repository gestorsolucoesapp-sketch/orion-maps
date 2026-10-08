import {strToU8,zipSync} from "fflate";
import type {Coordinate} from "./flight-plan";
export type CaptureMode="manual"|"time"|"distance";
export type PhotoMission={name:string;route:Coordinate[];height:number;speed:number;gimbal:number;captureMode:CaptureMode;interval:number};
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
const tag=(key:string,value:string|number)=>`<wpml:${key}>${value}</wpml:${key}>`;
export function photoMissionKmz(p:PhotoMission){
 if(p.route.length<2||p.route.length>200||p.route.some(c=>c.length!==2||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>75))throw Error("Rota inválida ou acima de 200 pontos.");
 if(!Number.isFinite(p.height)||p.height<1||p.height>500||!Number.isFinite(p.speed)||p.speed<=0||p.speed>15||!Number.isFinite(p.gimbal)||p.gimbal< -90||p.gimbal>0)throw Error("Parâmetros de voo inválidos.");
 if(!["manual","time","distance"].includes(p.captureMode)||!Number.isFinite(p.interval)||p.interval<=0||p.interval>500)throw Error("Configuração de captura inválida.");
 const config=`<wpml:missionConfig>${tag("flyToWaylineMode","safely")}${tag("finishAction","goHome")}${tag("exitOnRCLost","executeLostAction")}${tag("executeRCLostAction","goBack")}${tag("globalTransitionalSpeed",p.speed)}<wpml:droneInfo>${tag("droneEnumValue",68)}${tag("droneSubEnumValue",0)}</wpml:droneInfo></wpml:missionConfig>`;
 const action=p.captureMode==="manual"?"":`<wpml:actionGroup>${tag("actionGroupId",9000)}${tag("actionGroupStartIndex",0)}${tag("actionGroupEndIndex",p.route.length-1)}${tag("actionGroupMode","sequence")}<wpml:actionTrigger>${tag("actionTriggerType",p.captureMode==="time"?"multipleTiming":"multipleDistance")}${tag("actionTriggerParam",p.interval)}</wpml:actionTrigger><wpml:action>${tag("actionId",0)}${tag("actionActuatorFunc","takePhoto")}<wpml:actionActuatorFuncParam>${tag("payloadPositionIndex",0)}</wpml:actionActuatorFuncParam></wpml:action></wpml:actionGroup>`;
 const placemarks=p.route.map((c,i)=>`<Placemark><Point><coordinates>${c[0]},${c[1]}</coordinates></Point>${tag("index",i)}${tag("executeHeight",p.height)}${tag("waypointSpeed",p.speed)}<wpml:waypointHeadingParam>${tag("waypointHeadingMode","followWayline")}</wpml:waypointHeadingParam><wpml:waypointTurnParam>${tag("waypointTurnMode","toPointAndStopWithDiscontinuityCurvature")}</wpml:waypointTurnParam>${tag("gimbalPitchAngle",p.gimbal)}${i===0?action:""}</Placemark>`).join("");
 const folder=`<Folder>${tag("templateType","waypoint")}${tag("templateId",0)}${tag("executeHeightMode","relativeToStartPoint")}${tag("waylineId",0)}${tag("autoFlightSpeed",p.speed)}${placemarks}</Folder>`;
 const header=`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2"><Document>${tag("author","fly")}<name>${esc(p.name.slice(0,120))}</name>${config}`;
 const waylines=header+folder+"</Document></kml>";
 const template=header.replace(config,config)+folder+"</Document></kml>";
 return zipSync({"wpmz/template.kml":strToU8(template),"wpmz/waylines.wpml":strToU8(waylines)});
}

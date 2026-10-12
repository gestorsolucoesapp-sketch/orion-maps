import type {Coordinate} from "./flight-plan";
import type {CaptureMode} from "./photo-mission";

/** Read-only, deterministic preview. No storage, device API or mission-export dependency. */
export type SimulationInput={legs:Coordinate[][];captureLegs?:boolean[];captureEdges?:boolean[];height:number;speed:number;captureMode:CaptureMode;photoInterval:number;captureDistance:number;home?:Coordinate|null;climbSpeed?:number;descentSpeed?:number;turnSeconds?:number;returnHome?:boolean;includeTakeoff?:boolean};
export type FlightPhase="takeoff"|"approach"|"survey"|"connection"|"turn"|"return"|"landing";
export const PHASE_LABELS:Record<FlightPhase,string>={takeoff:"Decolagem simulada",approach:"Ida ao primeiro waypoint",survey:"Percorrendo a faixa",connection:"Conexão entre faixas",turn:"Mudança de direção",return:"Retorno simulado à base",landing:"Pouso simulado"};
export type FlightSegment={from:Coordinate;to:Coordinate;fromHeight:number;toHeight:number;start:number;end:number;distanceStart:number;distanceEnd:number;heading:number;nextHeading:number;phase:FlightPhase;leg:number;waypoint:number;acquiring:boolean};
export type SimulatedPhoto={time:number;position:Coordinate;number:number};
export type FlightSimulation={segments:FlightSegment[];photos:SimulatedPhoto[];route:Coordinate[];home:Coordinate;homeAssumed:boolean;height:number;speed:number;seconds:number;routeSeconds:number;horizontalM:number;routeM:number;captureM:number;captureSeconds:number;acquisitionStart:number;acquisitionEnd:number;captureMode:CaptureMode;climbSpeed:number;descentSpeed:number;turnSeconds:number;returnHome:boolean};
export type FlightFrame={time:number;position:Coordinate;height:number;heading:number;phase:FlightPhase;leg:number;waypoint:number;speed:number;verticalSpeed:number;distance:number;photosTaken:number;finished:boolean;segmentIndex:number};
const R=6371008.8,D=Math.PI/180;
export function simulationPoint(value:unknown):value is Coordinate{return Array.isArray(value)&&value.length===2&&value.every(n=>typeof n==="number"&&Number.isFinite(n))&&Math.abs(value[0])<=180&&Math.abs(value[1])<=75;}
export function flightDistance(a:Coordinate,b:Coordinate):number{const dy=(b[1]-a[1])*D,dx=(b[0]-a[0])*D,h=Math.sin(dy/2)**2+Math.cos(a[1]*D)*Math.cos(b[1]*D)*Math.sin(dx/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
export function flightHeading(a:Coordinate,b:Coordinate):number{const delta=(b[0]-a[0])*D,y=Math.sin(delta)*Math.cos(b[1]*D),x=Math.cos(a[1]*D)*Math.sin(b[1]*D)-Math.sin(a[1]*D)*Math.cos(b[1]*D)*Math.cos(delta);return (Math.atan2(y,x)/D+360)%360;}
export function headingDelta(a:number,b:number):number{return ((b-a+540)%360)-180;}
export function interpolateFlight(a:Coordinate,b:Coordinate,fraction:number):Coordinate{
 if(fraction<=0)return [...a];if(fraction>=1)return [...b];const angular=flightDistance(a,b)/R;if(angular<1e-12)return [...a];
 const latitude=a[1]*D,longitude=a[0]*D,bearing=flightHeading(a,b)*D,d=angular*fraction;
 const lat=Math.asin(Math.sin(latitude)*Math.cos(d)+Math.cos(latitude)*Math.sin(d)*Math.cos(bearing));
 const lon=longitude+Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(latitude),Math.cos(d)-Math.sin(latitude)*Math.sin(lat));
 return [((lon/D+540)%360)-180,lat/D];
}
function numberIn(value:number,min:number,max:number,label:string):number{if(!Number.isFinite(value)||value<min||value>max)throw Error(`Revise ${label} (${min} a ${max}).`);return value;}
function after<T>(items:T[],value:number,read:(item:T)=>number):number{let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>>1;if(read(items[mid])<=value)lo=mid+1;else hi=mid;}return lo;}
export function buildFlightSimulation(input:SimulationInput):FlightSimulation{
 const height=numberIn(input.height,1,500,"a altura em metros"),speed=numberIn(input.speed,.1,30,"a velocidade em m/s");
 const climbSpeed=numberIn(input.climbSpeed??2,.2,10,"a subida simulada em m/s"),descentSpeed=numberIn(input.descentSpeed??2,.2,10,"a descida simulada em m/s"),turnSeconds=numberIn(input.turnSeconds??1,0,30,"a pausa de direção em segundos");
 if(!["manual","time","distance"].includes(input.captureMode))throw Error("Modo de captura inválido.");
 const interval=input.captureMode==="distance"?numberIn(input.captureDistance,1,500,"a distância entre fotos"):numberIn(input.photoInterval,1,60,"o intervalo entre fotos");
 if(!Array.isArray(input.legs)||input.legs.length>5000||input.legs.some(leg=>!Array.isArray(leg)||leg.length<2||leg.some(p=>!simulationPoint(p))))throw Error("Gere uma rota válida antes de simular.");
 const captureLegs=input.captureLegs??input.legs.map(()=>true);
 if(captureLegs.length!==input.legs.length||captureLegs.some(value=>typeof value!=="boolean"))throw Error("Revise os trechos de captura da rota.");
 const entries=input.legs.flatMap((leg,index)=>leg.map(point=>({point:[...point] as Coordinate,leg:index+1})));
 if(entries.length<2||entries.length>10000)throw Error("A simulação aceita rotas de 2 a 10.000 waypoints.");
 if(input.captureEdges&&(input.captureEdges.length!==entries.length-1||input.captureEdges.some(value=>typeof value!=="boolean")))throw Error("Revise os trechos de captura do arquivo.");
 const route=entries.map(p=>p.point),home=input.home??route[0];
 if(!simulationPoint(home))throw Error("Ponto de decolagem simulado inválido.");
 if(route.some(p=>flightDistance(route[0],p)>20000)||flightDistance(home,route[0])>20000)throw Error("Mantenha a rota e a base simulada em uma extensão de até 20 km.");
 const moving=entries.slice(1).map((entry,i)=>({from:entries[i].point,to:entry.point,leg:entry.leg,waypoint:i+2,phase:(input.captureEdges?input.captureEdges[i]:entry.leg===entries[i].leg&&captureLegs[entry.leg-1])?"survey" as FlightPhase:"connection" as FlightPhase,length:flightDistance(entries[i].point,entry.point)})).filter(s=>s.length>.001);
 if(!moving.length)throw Error("A rota precisa ter dois pontos distintos.");
 const segments:FlightSegment[]=[];let time=0,distance=0,heading=flightHeading(moving[0].from,moving[0].to);
 function append(from:Coordinate,to:Coordinate,fromHeight:number,toHeight:number,seconds:number,phase:FlightPhase,leg=0,waypoint=0,acquiring=false,nextHeading=heading){
  if(seconds<=1e-9)return;
  const length=flightDistance(from,to);segments.push({from:[...from],to:[...to],fromHeight,toHeight,start:time,end:time+seconds,distanceStart:distance,distanceEnd:distance+length,heading,nextHeading,phase,leg,waypoint,acquiring});time+=seconds;distance+=length;heading=nextHeading;
 }
 function rotate(at:Coordinate,next:number,leg:number,waypoint:number,acquiring:boolean){if(Math.abs(headingDelta(heading,next))>1)append(at,at,height,height,turnSeconds,"turn",leg,waypoint,acquiring,next);heading=next;}
 const approach=flightDistance(home,route[0]);if(approach>.001)heading=flightHeading(home,route[0]);
 if(input.includeTakeoff!==false)append(home,home,0,height,height/climbSpeed,"takeoff");
 if(approach>.001)append(home,route[0],height,height,approach/speed,"approach");
 rotate(route[0],flightHeading(moving[0].from,moving[0].to),1,1,false);
 const routeStartDistance=distance;
 moving.forEach(s=>{const next=flightHeading(s.from,s.to);rotate(s.from,next,s.leg,s.waypoint-1,false);append(s.from,s.to,height,height,s.length/speed,s.phase,s.leg,s.waypoint,s.phase==="survey");});
 const routeM=distance-routeStartDistance,routeSeconds=routeM/speed;
 const returnHome=input.returnHome!==false,last=route.at(-1)!;
 if(returnHome){const back=flightDistance(last,home);if(back>.001){rotate(last,flightHeading(last,home),0,route.length,false);append(last,home,height,height,back/speed,"return");}append(home,home,height,0,height/descentSpeed,"landing");}
 const captureSegments=segments.filter(s=>s.acquiring&&s.distanceEnd>s.distanceStart);
 const captureM=captureSegments.reduce((sum,s)=>sum+s.distanceEnd-s.distanceStart,0),captureSeconds=captureSegments.reduce((sum,s)=>sum+s.end-s.start,0);
 const acquisitionStart=captureSegments[0]?.start??0,acquisitionEnd=captureSegments.at(-1)?.end??0;
 const simulation:FlightSimulation={segments,photos:[],route:route.map(p=>[...p]),home:[...home],homeAssumed:input.home==null,height,speed,seconds:time,routeSeconds,horizontalM:distance,routeM,captureM,captureSeconds,acquisitionStart,acquisitionEnd,captureMode:input.captureMode,climbSpeed,descentSpeed,turnSeconds,returnHome};
 const extent=input.captureMode==="distance"?captureM:captureSeconds,count=captureSegments.length?Math.floor((extent+1e-7)/interval)+1:0;
 if(count>30000)throw Error("Mais de 30.000 fotos simuladas. Divida a área ou aumente o intervalo.");
 const offsets:number[]=[];let total=0;
 for(const s of captureSegments){total+=input.captureMode==="distance"?s.distanceEnd-s.distanceStart:s.end-s.start;offsets.push(total);}
 for(let i=0;i<count;i++){
  const target=Math.min(extent,i*interval),index=Math.min(after(offsets,target-1e-8,value=>value),captureSegments.length-1),segment=captureSegments[index];
  const span=input.captureMode==="distance"?segment.distanceEnd-segment.distanceStart:segment.end-segment.start;
  const fraction=Math.max(0,Math.min(1,(target-(offsets[index-1]??0))/span)),photoTime=segment.start+(segment.end-segment.start)*fraction;
  simulation.photos.push({time:photoTime,position:interpolateFlight(segment.from,segment.to,fraction),number:i+1});
 }
 return simulation;
}
export function flightFrame(simulation:FlightSimulation,seconds:number):FlightFrame{
 if(!Number.isFinite(seconds))throw Error("Tempo de simulação inválido.");
 const time=Math.max(0,Math.min(simulation.seconds,seconds)),index=Math.min(after(simulation.segments,time,s=>s.end),simulation.segments.length-1),s=simulation.segments[index];
 const portion=Math.max(0,Math.min(1,(time-s.start)/(s.end-s.start))),finished=time>=simulation.seconds,photosTaken=after(simulation.photos,time+1e-8,p=>p.time);
 return {time,position:interpolateFlight(s.from,s.to,portion),height:s.fromHeight+(s.toHeight-s.fromHeight)*portion,heading:(s.heading+headingDelta(s.heading,s.nextHeading)*portion+360)%360,phase:s.phase,leg:s.leg,waypoint:s.waypoint,speed:finished?0:(s.distanceEnd-s.distanceStart)/(s.end-s.start),verticalSpeed:finished?0:(s.toHeight-s.fromHeight)/(s.end-s.start),distance:s.distanceStart+(s.distanceEnd-s.distanceStart)*portion,photosTaken,finished,segmentIndex:index};
}
export function simulationTrace(simulation:FlightSimulation,frame:FlightFrame):Coordinate[]{const points:Coordinate[]=[[...simulation.home]];for(let i=0;i<frame.segmentIndex;i++){const s=simulation.segments[i];if(s.distanceEnd>s.distanceStart)points.push([...s.to]);}points.push([...frame.position]);return points;}
export function advanceSimulation(time:number,deltaMs:number,rate:number,duration:number):number{if(![time,deltaMs,rate,duration].every(Number.isFinite)||deltaMs<0||rate<=0||duration<0)throw Error("Relógio de simulação inválido.");return Math.min(duration,Math.max(0,time)+deltaMs*rate/1000);}

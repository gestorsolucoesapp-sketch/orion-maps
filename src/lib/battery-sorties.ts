import type {Coordinate} from "./flight-plan";

export type BatterySortie={number:number;startWaypoint:number;endWaypoint:number;approachMeters:number;surveyMeters:number;returnMeters:number;estimatedSeconds:number;landingBatteryPercent:number};
export type BatteryPlan={sorties:BatterySortie[];usableSeconds:number;reservePercent:number;homeAssumed:boolean;error:string};
export type BatteryPlanInput={legs:Coordinate[][];home?:Coordinate|null;speed:number;height:number;totalMinutes:number;reservePercent:number;climbSpeed?:number;descentSpeed?:number;turnSeconds?:number};
const radians=Math.PI/180;
function distance(a:Coordinate,b:Coordinate){const lat=(b[1]-a[1])*radians,lon=(b[0]-a[0])*radians,h=Math.sin(lat/2)**2+Math.cos(a[1]*radians)*Math.cos(b[1]*radians)*Math.sin(lon/2)**2;return 2*6371008.8*Math.asin(Math.min(1,Math.sqrt(h)));}
const valid=(p:unknown):p is Coordinate=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==="number"&&Number.isFinite(n))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=75;

/** Planning preview only. Every sortie returns to the selected base before the reserve is spent. */
export function planBatterySorties(input:BatteryPlanInput):BatteryPlan{
 const empty=(error:string):BatteryPlan=>({sorties:[],usableSeconds:0,reservePercent:input.reservePercent,homeAssumed:!input.home,error});
 const route=input.legs.flat();
 if(route.length<2||route.length>10000||route.some(p=>!valid(p)))return empty("Gere uma rota válida para calcular as trocas de bateria.");
 const home=input.home??route[0];if(!valid(home))return empty("Defina uma base válida no mapa.");
 const {speed,height,totalMinutes,reservePercent}=input,climb=input.climbSpeed??2,descent=input.descentSpeed??2,turn=input.turnSeconds??1;
 if(![speed,height,totalMinutes,reservePercent,climb,descent,turn].every(Number.isFinite)||speed<=0||speed>30||height<=0||height>500||totalMinutes<=0||totalMinutes>180||reservePercent<10||reservePercent>50||climb<=0||descent<=0||turn<0)return empty("Revise autonomia, reserva, altura e velocidades.");
 const usableSeconds=totalMinutes*60*(1-reservePercent/100),fixedSeconds=height/climb+height/descent;
 const result:BatterySortie[]=[];let start=0;
 while(start<route.length-1){
  let last=-1,lastSurvey=0,lastSeconds=0,survey=0;
  for(let end=start+1;end<route.length;end++){
   survey+=distance(route[end-1],route[end]);
   const seconds=fixedSeconds+(distance(home,route[start])+survey+distance(route[end],home))/speed+(end-start)*turn;
   if(seconds>usableSeconds+1e-6)break;
   last=end;lastSurvey=survey;lastSeconds=seconds;
  }
  if(last<0)return {...empty(`Não há autonomia para sair da base, percorrer o trecho após o waypoint ${start+1} e retornar com ${reservePercent}% de reserva. Reduza a área ou revise a base e a bateria.`),usableSeconds};
  result.push({number:result.length+1,startWaypoint:start+1,endWaypoint:last+1,approachMeters:distance(home,route[start]),surveyMeters:lastSurvey,returnMeters:distance(route[last],home),estimatedSeconds:lastSeconds,landingBatteryPercent:100*(1-lastSeconds/(totalMinutes*60))});
  if(result.length>100)return {...empty("O plano exige mais de 100 saídas. Divida o levantamento em áreas menores."),usableSeconds};
  start=last;
 }
 return {sorties:result,usableSeconds,reservePercent,homeAssumed:input.home==null,error:""};
}

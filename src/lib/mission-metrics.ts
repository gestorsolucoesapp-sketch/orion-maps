import type {Coordinate} from "./flight-plan";
const radians=Math.PI/180;
export function routeMetrics(legs:Coordinate[][],speed:number,batteryMinutes:number){
 if(!Number.isFinite(speed)||speed<=0||!Number.isFinite(batteryMinutes)||batteryMinutes<=0)throw new Error("Informe velocidade e minutos úteis por bateria maiores que zero.");
 const route=legs.flat();
 const length=route.slice(1).reduce((sum,b,i)=>{const a=route[i],lat=(b[1]-a[1])*radians,lon=(b[0]-a[0])*radians,h=Math.sin(lat/2)**2+Math.cos(a[1]*radians)*Math.cos(b[1]*radians)*Math.sin(lon/2)**2;return sum+2*6371008.8*Math.asin(Math.min(1,Math.sqrt(h)));},0);
 const seconds=length/speed;
 return {waypoints:route.length,length,seconds,batteries:seconds?Math.ceil(seconds/(batteryMinutes*60)):0,photos3:seconds?Math.ceil(seconds/3):0,photos5:seconds?Math.ceil(seconds/5):0};
}
export function formatFlightTime(seconds:number){const total=Math.round(seconds);return `${Math.floor(total/60)}min ${total%60}s`;}

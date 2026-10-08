import type {Coordinate} from "./flight-plan";
const R=6371008.8;
const rad=Math.PI/180;
export function metres(a:Coordinate,b:Coordinate){const lat=(a[1]+b[1])/2*rad;return Math.hypot((b[0]-a[0])*rad*Math.cos(lat),(b[1]-a[1])*rad)*R;}
export function move(point:Coordinate,east:number,north:number):Coordinate{return [point[0]+east/(R*rad*Math.cos(point[1]*rad)),point[1]+north/(R*rad)];}
export function orbitRoute(points:Coordinate[],samples=36){
 if(points.length<2)return {legs:[] as Coordinate[][],photos:[] as Coordinate[],area:0,length:0,seconds:0};
 const center=points[0],radius=metres(center,points[1]);
 if(!Number.isFinite(radius)||radius<5||radius>2000)throw Error("O raio da órbita deve estar entre 5 e 2.000 m.");
 const count=Math.max(12,Math.min(180,Math.round(samples)));
 const ring=Array.from({length:count},(_,i)=>{const a=2*Math.PI*i/count;return move(center,Math.sin(a)*radius,Math.cos(a)*radius);});
 ring.push(ring[0]);return {legs:[ring],photos:ring.slice(0,-1),area:Math.PI*radius*radius,length:2*Math.PI*radius,seconds:0};
}
export function corridorRoute(points:Coordinate[],width:number,spacing:number){
 if(points.length<2)return {legs:[] as Coordinate[][],photos:[] as Coordinate[],area:0,length:0,seconds:0};
 if(!Number.isFinite(width)||width<5||width>500)throw Error("Largura do corredor deve ficar entre 5 e 500 m.");
 if(!Number.isFinite(spacing)||spacing<=0)throw Error("Espaçamento de faixas inválido.");
 const lanes=Math.max(2,Math.ceil(width/spacing)+1);
 if(lanes>40)throw Error("Corredor exige mais de 40 faixas. Ajuste altura ou largura.");
 const offsets=Array.from({length:lanes},(_,i)=>-width/2+width*i/(lanes-1));
 const legs=offsets.map((offset,index)=>{
   const path=points.map((p,i)=>{
     const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
     const dx=(next[0]-prev[0])*rad*Math.cos(p[1]*rad)*R,dy=(next[1]-prev[1])*rad*R;
     const length=Math.hypot(dx,dy);if(length<0.01)throw Error("Remova pontos repetidos do corredor.");
     return move(p,-dy/length*offset,dx/length*offset);
   });
   return index%2?[...path].reverse():path;
 });
 const distance=points.slice(1).reduce((s,p,i)=>s+metres(points[i],p),0);
 return {legs,photos:[] as Coordinate[],area:width*distance,length:distance*lanes,seconds:0};
}
export function flightWarnings(args:{drone:string;mode:string;points:number;waypoints:number;speed:number;height:number;minutes:number;batteryMinutes:number;photoInterval:number;minInterval:number|null;requiredInterval:number|null;terrainConfirmed:boolean}){
 const a=args,w:string[]=[];
 if(a.drone!=="DJI Mini 5 Pro")w.push("Selecione DJI Mini 5 Pro para validar a missão no perfil de referência.");
 if(a.points<2)w.push("Defina os pontos antes de gerar a missão.");
 if(a.waypoints>200)w.push("Mais de 200 waypoints: divida a missão antes de exportar para DJI Fly.");
 if(a.speed>15||a.speed<=0)w.push("Velocidade fora do limite de transferência de 0–15 m/s.");
 if(a.height<=0||a.height>500)w.push("Altura fora do intervalo do planejador.");
 if(a.minutes>a.batteryMinutes)w.push("A rota excede a autonomia útil informada. Divida em baterias.");
 if(a.minInterval!==null&&a.photoInterval<a.minInterval)w.push("Intervalo de foto inferior ao mínimo informado para a câmera.");
 if(a.requiredInterval!==null&&a.requiredInterval<a.photoInterval)w.push("Sobreposição frontal insuficiente para velocidade e intervalo selecionados.");
 if(!a.terrainConfirmed)w.push("Altura relativa à decolagem: o seguimento de relevo e obstáculos não foram verificados.");
 if(a.mode==='orbit')w.push("Órbita calculada em altitude única. Verifique árvores, edificações e obstáculos em toda a circunferência.");
 return w;
}

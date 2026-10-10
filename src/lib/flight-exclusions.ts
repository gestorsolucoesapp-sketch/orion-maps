import {validateBoundary,type Coordinate} from "./flight-plan.ts";

const R=6371008.8, DEG=Math.PI/180, CLEARANCE=5;
type Point=Coordinate;
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const length=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const onSegment=(a:Point,b:Point,p:Point)=>Math.abs(cross(a,b,p))<1e-7&&p[0]>=Math.min(a[0],b[0])-1e-7&&p[0]<=Math.max(a[0],b[0])+1e-7&&p[1]>=Math.min(a[1],b[1])-1e-7&&p[1]<=Math.max(a[1],b[1])+1e-7;
const edgeCross=(a:Point,b:Point,c:Point,d:Point)=>cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8;
const edges=(ring:Point[])=>ring.map((p,i):[Point,Point]=>[p,ring[(i+1)%ring.length]]);
export function insidePolygon(p:Point,ring:Point[],includeBoundary=true){
 let inside=false;
 for(const [a,b] of edges(ring)){
  if(onSegment(a,b,p))return includeBoundary;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function localProjection(origin:Coordinate){
 const cosine=Math.cos(origin[1]*DEG);
 return {toLocal:(p:Coordinate):Point=>[(p[0]-origin[0])*DEG*R*cosine,(p[1]-origin[1])*DEG*R],toGeo:(p:Point):Coordinate=>[origin[0]+p[0]/(DEG*R*cosine),origin[1]+p[1]/(DEG*R)]};
}
function hull(points:Point[]):Point[]{
 const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const chain=(items:Point[])=>{const out:Point[]=[];for(const p of items){while(out.length>=2&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();out.push(p);}return out;};
 return [...chain(sorted).slice(0,-1),...chain(sorted.reverse()).slice(0,-1)];
}
function expandedHull(ring:Point[]):Point[]{
 const samples:Point[]=[];
 for(const [x,y] of ring)for(let i=0;i<24;i++){const a=2*Math.PI*i/24;samples.push([x+CLEARANCE*Math.cos(a),y+CLEARANCE*Math.sin(a)]);}
 return hull(samples);
}
export function validateExclusions(boundary:Coordinate[],exclusions:Coordinate[][]){
 if(exclusions.length>20)throw new Error("Use até 20 áreas isoladas por plano.");
 const outer=validateBoundary(boundary),projection=localProjection(boundary[0]);
 const holes=exclusions.map((ring,index)=>{
  if(ring.length>100)throw new Error(`A área isolada ${index+1} excede 100 pontos.`);
  validateBoundary(ring);
  const local=ring.map(projection.toLocal);
  const area=Math.abs(local.reduce((sum,p,i)=>sum+p[0]*local[(i+1)%local.length][1]-local[(i+1)%local.length][0]*p[1],0))/2;
  if(local.some(p=>!insidePolygon(p,outer.points))||local.some(p=>edges(outer.points).some(([a,b])=>onSegment(a,b,p))))throw new Error(`A área isolada ${index+1} precisa ficar dentro do contorno externo.`);
  if(edges(local).some(([a,b])=>edges(outer.points).some(([c,d])=>edgeCross(a,b,c,d))))throw new Error(`A área isolada ${index+1} cruza o contorno externo.`);
  return {ring:local,area,avoid:expandedHull(local)};
 });
 for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++){
  const a=holes[i].ring,b=holes[j].ring;
  if(a.some(p=>insidePolygon(p,b))||b.some(p=>insidePolygon(p,a))||edges(a).some(([p,q])=>edges(b).some(([r,s])=>edgeCross(p,q,r,s))))throw new Error("Áreas isoladas não podem se sobrepor ou tocar.");
 }
 const netArea=outer.area-holes.reduce((sum,h)=>sum+h.area,0);
 if(netArea<1)throw new Error("A área útil precisa ter pelo menos 1 m².");
 return {area:netArea,excludedArea:outer.area-netArea,holes:holes.map(h=>h.avoid),projection};
}
export function segmentAvoidsHoles(a:Point,b:Point,holes:Point[][]){
 return holes.every(ring=>!insidePolygon(a,ring,false)&&!insidePolygon(b,ring,false)&&[.25,.5,.75].every(t=>!insidePolygon([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],ring,false))&&!edges(ring).some(([c,d])=>edgeCross(a,b,c,d)));
}
export function routeAroundHoles(start:Point,end:Point,holes:Point[][]):Point[]{
 if(segmentAvoidsHoles(start,end,holes))return [start,end];
 const vertices=[start,end,...holes.flat()];
 if(vertices.length>240)throw new Error("Muitas áreas isoladas para calcular conexões. Divida o plano em áreas menores.");
 const best=Array(vertices.length).fill(Infinity) as number[],previous=Array(vertices.length).fill(-1) as number[],used=Array(vertices.length).fill(false) as boolean[];
 best[0]=0;
 for(let step=0;step<vertices.length;step++){
  let current=-1;for(let i=0;i<vertices.length;i++)if(!used[i]&&(current<0||best[i]<best[current]))current=i;
  if(current<0||!Number.isFinite(best[current]))break;
  if(current===1)break;
  used[current]=true;
  for(let next=0;next<vertices.length;next++){
   if(next===current||used[next]||!segmentAvoidsHoles(vertices[current],vertices[next],holes))continue;
   const candidate=best[current]+length(vertices[current],vertices[next]);
   if(candidate<best[next]){best[next]=candidate;previous[next]=current;}
  }
 }
 if(!Number.isFinite(best[1]))throw new Error("Não foi possível ligar as faixas sem cruzar as áreas isoladas.");
 const path:Point[]=[];for(let at=1;at>=0;at=previous[at]){path.unshift(vertices[at]);if(at===0)break;}
 return path;
}

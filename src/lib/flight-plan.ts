import {insidePolygon,routeAroundHoles,segmentAvoidsHoles,validateExclusions} from "./flight-exclusions.ts";
export type Coordinate = [number, number]; // longitude, latitude
export type GridOptions = { spacing: number; photoSpacing: number; bearing: number; speed: number; doubleGrid: boolean; perimeterPass?: boolean };
export type Grid = { legs: Coordinate[][]; captureLegs: boolean[]; photos: Coordinate[]; area: number; length: number; seconds: number; spacing: number };
const R = 6371008.8, DEG = Math.PI / 180;
const cross = (a: Coordinate, b: Coordinate, c: Coordinate) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance = (a: Coordinate,b: Coordinate) => Math.hypot(a[0]-b[0],a[1]-b[1]);

// Keep the optional transfer to the perimeter inside a concave boundary.
function withinBoundary(a:Coordinate,b:Coordinate,ring:Coordinate[]):boolean{
 if(!insidePolygon(a,ring)||!insidePolygon(b,ring))return false;
 const cuts=[0,1],r:Coordinate=[b[0]-a[0],b[1]-a[1]];
 for(let i=0;i<ring.length;i++){
  const c=ring[i],d=ring[(i+1)%ring.length],s:Coordinate=[d[0]-c[0],d[1]-c[1]],den=r[0]*s[1]-r[1]*s[0];
  if(Math.abs(den)<1e-9)continue;
  const x=c[0]-a[0],y=c[1]-a[1],t=(x*s[1]-y*s[0])/den,u=(x*r[1]-y*r[0])/den;
  if(t>1e-9&&t<1-1e-9&&u>=-1e-9&&u<=1+1e-9)cuts.push(t);
 }
 cuts.sort((x,y)=>x-y);
 return cuts.slice(1).every((t,i)=>{const middle=(t+cuts[i])/2;return insidePolygon([a[0]+r[0]*middle,a[1]+r[1]*middle],ring);});
}

function intersects(a: Coordinate,b: Coordinate,c: Coordinate,d: Coordinate) {
  const abC=cross(a,b,c), abD=cross(a,b,d), cdA=cross(c,d,a), cdB=cross(c,d,b);
  const on=(p: Coordinate,q: Coordinate,r: Coordinate) => Math.abs(cross(p,q,r))<1e-7 && r[0]>=Math.min(p[0],q[0])-1e-7 && r[0]<=Math.max(p[0],q[0])+1e-7 && r[1]>=Math.min(p[1],q[1])-1e-7 && r[1]<=Math.max(p[1],q[1])+1e-7;
  return (abC*abD<0 && cdA*cdB<0) || on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}

export function validateBoundary(input: Coordinate[]) {
  if (!Array.isArray(input) || input.length<3 || input.length>200) throw new Error("Desenhe uma área com 3 a 200 vértices.");
  for (const p of input) if (!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>75) throw new Error("Coordenadas inválidas. Esta versão atende latitudes entre 75°S e 75°N.");
  const origin=input[0], cos=Math.cos(origin[1]*DEG);
  const toLocal=(p: Coordinate): Coordinate => [(p[0]-origin[0])*DEG*R*cos,(p[1]-origin[1])*DEG*R];
  const toGeo=(p: Coordinate): Coordinate => [origin[0]+p[0]/(DEG*R*cos),origin[1]+p[1]/(DEG*R)];
  const points=input.map(toLocal);
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  if (Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))>20000) throw new Error("Divida a área: o planejamento local aceita extensões de até 20 km.");
  for(let i=0;i<points.length;i++) {
    if(distance(points[i],points[(i+1)%points.length])<0.05) throw new Error("Remova os vértices repetidos ou próximos demais.");
    for(let j=i+1;j<points.length;j++) {
      if(j===i+1 || (i===0&&j===points.length-1)) continue;
      if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length])) throw new Error("O contorno cruza a si mesmo. Desfaça os pontos e redesenhe o limite.");
    }
  }
  const area=Math.abs(points.reduce((s,p,i)=>s+p[0]*points[(i+1)%points.length][1]-points[(i+1)%points.length][0]*p[1],0))/2;
  if(area<1) throw new Error("A área precisa ter pelo menos 1 m² e não pode ser uma linha.");
  return {points,toGeo,area};
}

export function generateGrid(boundary: Coordinate[], options: GridOptions, exclusions: Coordinate[][]=[]): Grid {
  const {points,toGeo,area:outerArea}=validateBoundary(boundary);
  const excluded=exclusions.length?validateExclusions(boundary,exclusions):null;
  const area=excluded?.area??outerArea;
  const holes=excluded?.holes??[];
  if([options.spacing,options.photoSpacing,options.speed].some(n=>!Number.isFinite(n)||n<=0)||!Number.isFinite(options.bearing)) throw new Error("Informe espaçamentos e velocidade maiores que zero e um rumo válido.");
  const legs: Coordinate[][]=[], captureLegs:boolean[]=[], photos: Coordinate[]=[];
  let length=0, tightest=options.spacing;
  for(const angle of options.doubleGrid?[options.bearing,options.bearing+90]:[options.bearing]) {
    const a=angle*DEG, cos=Math.cos(a), sin=Math.sin(a);
    // u points across the strips; v follows the compass bearing (north=0).
    const rotated=points.map(([x,y]): Coordinate=>[x*cos-y*sin,x*sin+y*cos]);
    const unrotate=([u,v]: Coordinate): Coordinate=>[u*cos+v*sin,-u*sin+v*cos];
    const min=Math.min(...rotated.map(p=>p[0])), max=Math.max(...rotated.map(p=>p[0]));
    const count=Math.max(1,Math.ceil((max-min)/options.spacing));
    if(count>2000) throw new Error("A grade excedeu 2.000 faixas. Aumente o espaçamento ou divida a área.");
    const step=(max-min)/count; tightest=Math.min(tightest,step);
    for(let row=0;row<count;row++) {
      const u=min+(row+0.5)*step;
      const intervals=(ring:Coordinate[])=>{const crossings:number[]=[];
       for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];if((p[0]<=u&&q[0]>u)||(q[0]<=u&&p[0]>u))crossings.push(p[1]+(u-p[0])*(q[1]-p[1])/(q[0]-p[0]));}
       crossings.sort((x,y)=>x-y);const result:[number,number][]=[];for(let i=0;i+1<crossings.length;i+=2)if(crossings[i+1]-crossings[i]>=.001)result.push([crossings[i],crossings[i+1]]);return result;
      };
      let spans=intervals(rotated);
      for(const hole of holes){const cut=intervals(hole.map(([x,y]):Coordinate=>[x*cos-y*sin,x*sin+y*cos]));for(const [low,high] of cut)spans=spans.flatMap(([start,end]):[number,number][]=>high<=start||low>=end?[[start,end]]:[[start,Math.min(low,end)],[Math.max(high,start),end]].filter(([a,b])=>b-a>=.001) as [number,number][]);}
      const parts: Coordinate[][]=[];
      for(const [start,end] of spans)parts.push([[u,start],[u,end]]);
      if(row%2) {parts.reverse();parts.forEach(part=>part.reverse());}
      for(const segment of parts) {
        const [p,q]=segment, len=distance(p,q), intervals=Math.max(1,Math.ceil(len/options.photoSpacing));
        if(photos.length+intervals+1>30000) throw new Error("O plano excedeu 30.000 fotos. Divida a área ou revise os parâmetros.");
        const geoSegment=segment.map(p=>toGeo(unrotate(p)));
        if(holes.length&&legs.length){const previous=legs.at(-1)!.at(-1)!,connector=routeAroundHoles(excluded!.projection.toLocal(previous),unrotate(p),holes);if(connector.length>2){legs.push(connector.map(excluded!.projection.toGeo));captureLegs.push(false);}}
        length+=len; legs.push(geoSegment);captureLegs.push(true);
        for(let i=0;i<=intervals;i++) photos.push(toGeo(unrotate([p[0]+(q[0]-p[0])*i/intervals,p[1]+(q[1]-p[1])*i/intervals])));
      }
    }
  }
  if(!legs.length) throw new Error("Não foi possível gerar faixas nessa área.");
  if(options.perimeterPass){
   const previous=legs.at(-1)!.at(-1)!;
   const from:Coordinate=[(previous[0]-boundary[0][0])*DEG*R*Math.cos(boundary[0][1]*DEG),(previous[1]-boundary[0][1])*DEG*R];
   const candidates=points.map((point,index)=>({point,index,meters:distance(from,point)})).sort((a,b)=>a.meters-b.meters);
   const chosen=candidates.find(({point})=>withinBoundary(from,point,points)&&segmentAvoidsHoles(from,point,holes));
   if(!chosen)throw new Error("Não foi possível ligar a rota ao perímetro sem sair da área ou cruzar um isolamento.");
   const ring=[...boundary.slice(chosen.index),...boundary.slice(0,chosen.index),boundary[chosen.index]];
   for(let i=0;i<ring.length-1;i++){
    const a=points[(chosen.index+i)%points.length],b=points[(chosen.index+i+1)%points.length],edge=distance(a,b),intervals=Math.max(1,Math.ceil(edge/options.photoSpacing));
    if(photos.length+intervals>30000)throw new Error("O plano excedeu 30.000 fotos. Divida a área ou revise os parâmetros.");
    length+=edge;
    for(let j=0;j<intervals;j++)photos.push(toGeo([a[0]+(b[0]-a[0])*j/intervals,a[1]+(b[1]-a[1])*j/intervals]));
   }
   legs.push(ring);captureLegs.push(true);
  }
  return {legs,captureLegs,photos,area,length,seconds:length/options.speed,spacing:tightest};
}

export function parseBoundaryGeoJson(value: unknown): Coordinate[] {
  if(!value || typeof value!=="object") throw new Error("Arquivo GeoJSON inválido.");
  const item=value as {type?:string;features?:unknown[];geometry?:unknown;coordinates?:unknown};
  if(item.type==="FeatureCollection") {
    if(item.features?.length!==1) throw new Error("Importe um GeoJSON com uma única área.");
    return parseBoundaryGeoJson(item.features[0]);
  }
  if(item.type==="Feature") return parseBoundaryGeoJson(item.geometry);
  if(item.type!=="Polygon"||!Array.isArray(item.coordinates)||item.coordinates.length!==1) throw new Error("Use um Polygon sem ilhas ou recortes internos, em longitude/latitude WGS84.");
  const ring=item.coordinates[0] as Coordinate[];
  if(!Array.isArray(ring)||ring.length<4||!Array.isArray(ring[0])||!Array.isArray(ring.at(-1))) throw new Error("Contorno GeoJSON inválido.");
  if(ring[0][0]!==ring.at(-1)![0]||ring[0][1]!==ring.at(-1)![1]) throw new Error("O contorno GeoJSON precisa estar fechado.");
  const boundary=ring.slice(0,-1); validateBoundary(boundary); return boundary;
}

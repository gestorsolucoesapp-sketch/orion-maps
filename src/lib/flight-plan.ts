export type Coordinate = [number, number]; // longitude, latitude
export type GridOptions = { spacing: number; photoSpacing: number; bearing: number; speed: number; doubleGrid: boolean };
export type Grid = { legs: Coordinate[][]; photos: Coordinate[]; area: number; length: number; seconds: number; spacing: number };
const R = 6371008.8, DEG = Math.PI / 180;
const cross = (a: Coordinate, b: Coordinate, c: Coordinate) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance = (a: Coordinate,b: Coordinate) => Math.hypot(a[0]-b[0],a[1]-b[1]);

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

export function generateGrid(boundary: Coordinate[], options: GridOptions): Grid {
  const {points,toGeo,area}=validateBoundary(boundary);
  if([options.spacing,options.photoSpacing,options.speed].some(n=>!Number.isFinite(n)||n<=0)||!Number.isFinite(options.bearing)) throw new Error("Informe espaçamentos e velocidade maiores que zero e um rumo válido.");
  const legs: Coordinate[][]=[], photos: Coordinate[]=[];
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
      const u=min+(row+0.5)*step, crossings:number[]=[];
      for(let i=0;i<rotated.length;i++) {
        const p=rotated[i],q=rotated[(i+1)%rotated.length];
        if((p[0]<=u&&q[0]>u)||(q[0]<=u&&p[0]>u)) crossings.push(p[1]+(u-p[0])*(q[1]-p[1])/(q[0]-p[0]));
      }
      crossings.sort((x,y)=>x-y);
      const parts: Coordinate[][]=[];
      for(let i=0;i+1<crossings.length;i+=2) {
        if(crossings[i+1]-crossings[i]<0.001) continue;
        parts.push([[u,crossings[i]],[u,crossings[i+1]]]);
      }
      if(row%2) {parts.reverse();parts.forEach(part=>part.reverse());}
      for(const segment of parts) {
        const [p,q]=segment, len=distance(p,q), intervals=Math.max(1,Math.ceil(len/options.photoSpacing));
        if(photos.length+intervals+1>30000) throw new Error("O plano excedeu 30.000 fotos. Divida a área ou revise os parâmetros.");
        length+=len; legs.push(segment.map(p=>toGeo(unrotate(p))));
        for(let i=0;i<=intervals;i++) photos.push(toGeo(unrotate([p[0]+(q[0]-p[0])*i/intervals,p[1]+(q[1]-p[1])*i/intervals])));
      }
    }
  }
  if(!legs.length) throw new Error("Não foi possível gerar faixas nessa área.");
  return {legs,photos,area,length,seconds:length/options.speed,spacing:tightest};
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

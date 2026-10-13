export type ClipPoint = [number, number];
export type ClipBounds = {west:number;south:number;east:number;north:number};
export type ClipSpec = {points:ClipPoint[];marginM:number};

export function orthophotoClipUrl(id:string,surveyId:string,spec:ClipSpec,mode:"preview"|"download"|"worldfile"|"projection"="preview"){
  const query=new URLSearchParams({survey:surveyId,clip:JSON.stringify(spec),mode});
  return `/api/orthophoto-clip/${encodeURIComponent(id)}?${query}`;
}

const DEG = Math.PI / 180;
const EARTH_A = 6378137;
const EARTH_E2 = 0.0066943799901413165;

/** Local tangent-plane metres, using WGS84 radii at the parcel latitude. */
function metricScale(latitude:number):[number,number]{
  const phi=latitude*DEG;
  const sin=Math.sin(phi);
  const denom=Math.sqrt(1-EARTH_E2*sin*sin);
  const east=DEG*EARTH_A*Math.cos(phi)/denom;
  const north=DEG*EARTH_A*(1-EARTH_E2)/(denom*denom*denom);
  return [east,north];
}

function crosses(a:ClipPoint,b:ClipPoint,c:ClipPoint,d:ClipPoint):boolean{
  const turn=(p:ClipPoint,q:ClipPoint,r:ClipPoint)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const ab1=turn(a,b,c),ab2=turn(a,b,d),cd1=turn(c,d,a),cd2=turn(c,d,b);
  const on=(p:ClipPoint,q:ClipPoint,r:ClipPoint)=>Math.abs(turn(p,q,r))<1e-7&&r[0]>=Math.min(p[0],q[0])-1e-7&&r[0]<=Math.max(p[0],q[0])+1e-7&&r[1]>=Math.min(p[1],q[1])-1e-7&&r[1]<=Math.max(p[1],q[1])+1e-7;
  return (ab1*ab2<0&&cd1*cd2<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}

export function validateClipSpec(raw:unknown):ClipSpec{
  if(!raw||typeof raw!=="object")throw new Error("Defina um contorno para o recorte.");
  const input=raw as {points?:unknown;marginM?:unknown};
  if(!Array.isArray(input.points)||input.points.length<3||input.points.length>100)throw new Error("O contorno precisa de 3 a 100 vértices.");
  if(typeof input.marginM!=="number"||!Number.isFinite(input.marginM)||input.marginM<0)throw new Error("A margem externa deve ser um número finito de metros, igual ou maior que zero.");
  const points=input.points.map(p=>{
    if(!Array.isArray(p)||p.length!==2||!p.every(v=>typeof v==="number"&&Number.isFinite(v)))throw new Error("Coordenadas inválidas no contorno.");
    const q=p as ClipPoint;
    if(Math.abs(q[0])>180||Math.abs(q[1])>85)throw new Error("Contorno fora da faixa geográfica aceita.");
    return [q[0],q[1]] as ClipPoint;
  });
  if(points.length>3&&points.at(-1)![0]===points[0][0]&&points.at(-1)![1]===points[0][1])points.pop();
  if(points.length<3)throw new Error("O contorno precisa de três vértices distintos.");
  const latitude=points.reduce((sum,p)=>sum+p[1],0)/points.length;
  const [mx,my]=metricScale(latitude);
  const origin=points[0];
  const local=points.map(([lon,lat])=>[(lon-origin[0])*mx,(lat-origin[1])*my] as ClipPoint);
  for(let i=0;i<local.length;i++){
    const a=local[i],b=local[(i+1)%local.length];
    if(Math.hypot(b[0]-a[0],b[1]-a[1])<0.1)throw new Error("Há vértices duplicados ou muito próximos.");
    for(let j=i+2;j<local.length;j++){
      if(i===0&&j===local.length-1)continue;
      if(crosses(a,b,local[j],local[(j+1)%local.length]))throw new Error("O contorno se cruza; ajuste seus vértices.");
    }
  }
  const area=Math.abs(local.reduce((sum,p,i)=>{const q=local[(i+1)%local.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
  if(area<1)throw new Error("O terreno é pequeno demais para um recorte confiável.");
  return {points,marginM:input.marginM};
}

/** Pixels map linearly to WGS84 bounds; metres are computed on the WGS84 tangent plane. */
export function clipPixelGeometry(spec:ClipSpec,bounds:ClipBounds,width:number,height:number){
  if(![bounds.west,bounds.south,bounds.east,bounds.north,width,height].every(Number.isFinite)||bounds.east<=bounds.west||bounds.north<=bounds.south||width<1||height<1)throw new Error("Georreferenciamento da ortofoto inválido.");
  const latitude=spec.points.reduce((sum,p)=>sum+p[1],0)/spec.points.length;
  const [mx,my]=metricScale(latitude);
  const xPerM=width/((bounds.east-bounds.west)*mx);
  const yPerM=height/((bounds.north-bounds.south)*my);
  const points=spec.points.map(([lon,lat])=>[(lon-bounds.west)*mx*xPerM,(bounds.north-lat)*my*yPerM] as ClipPoint);
  // Once the requested buffer exceeds the image diagonal, the finite source
  // coverage is the limit; a larger SVG stroke cannot add real source pixels.
  const effectiveMarginM=Math.min(spec.marginM,Math.hypot(width/xPerM,height/yPerM));
  const padX=effectiveMarginM*xPerM+2,padY=effectiveMarginM*yPerM+2;
  const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0]))-padX));
  const top=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))-padY));
  const right=Math.min(width,Math.ceil(Math.max(...points.map(p=>p[0]))+padX));
  const bottom=Math.min(height,Math.ceil(Math.max(...points.map(p=>p[1]))+padY));
  if(right<=left||bottom<=top)throw new Error("O contorno não cruza a ortofoto.");
  const clippedBounds={
    west:bounds.west+left/width*(bounds.east-bounds.west),
    east:bounds.west+right/width*(bounds.east-bounds.west),
    north:bounds.north-top/height*(bounds.north-bounds.south),
    south:bounds.north-bottom/height*(bounds.north-bounds.south),
  };
  const coverageLimited=left===0||top===0||right===width||bottom===height||effectiveMarginM<spec.marginM;
  return {points,left,top,width:right-left,height:bottom-top,xPerM,yPerM,effectiveMarginM,coverageLimited,bounds:clippedBounds};
}

export function clipWorldFile(bounds:ClipBounds,width:number,height:number):string{
  const dx=(bounds.east-bounds.west)/width,dy=(bounds.north-bounds.south)/height;
  return [dx,0,0,-dy,bounds.west+dx/2,bounds.north-dy/2].map(v=>v.toPrecision(16)).join("\n")+"\n";
}

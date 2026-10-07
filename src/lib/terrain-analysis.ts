import proj4 from "proj4";
import {SLOPE_CLASSES, slopePercentAt, validSample} from "./terrain-preview";

export type TerrainPoint = [number,number];
export type TerrainGrid = {
  band:ArrayLike<number>;width:number;height:number;noData:number|null;
  dx:number;dy:number;west:number;north:number;crs:string;sourceCrs:string;metric:boolean;
};
export type TerrainSample = {
  position:TerrainPoint;cellCenter:TerrainPoint|null;column:number|null;row:number|null;
  elevationM:number|null;slopePct:number|null;status:"ok"|"outside"|"nodata"|"neighbours";
};
export type SlopeAreaSummary = {
  method:"Horn 3x3 / native DTM / cell-centre polygon mask";
  polygonAreaM2:number;gridAreaM2:number;validAreaM2:number;unavailableAreaM2:number;coveragePct:number;
  cells:number;validCells:number;meanPct:number|null;minPct:number|null;maxPct:number|null;
  classes:{label:string;color:string;cells:number;areaM2:number;validSharePct:number}[];
  resolutionM:[number,number];sourceCrs:string;
};
export function assertTerrainGrid(g:TerrainGrid):void {
  if(!g.metric||!Number.isInteger(g.width)||!Number.isInteger(g.height)||g.width<3||g.height<3||g.band.length!==g.width*g.height||
    ![g.dx,g.dy,g.west,g.north].every(Number.isFinite)||g.dx<=0||g.dy<=0)throw Error("DTM incompatível: a análise exige uma grade regular com coordenadas e elevações em metros.");
}
function validPosition(p:TerrainPoint){return p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;}
export function projectTerrainPoint(g:TerrainGrid,p:TerrainPoint):TerrainPoint {
  if(!validPosition(p))throw Error("Coordenada inválida.");
  const point=proj4("EPSG:4326",g.crs,p) as TerrainPoint;
  if(!point.every(Number.isFinite))throw Error("Não foi possível localizar a coordenada no DTM.");
  return point;
}
export function sampleTerrainAtXY(g:TerrainGrid,xy:TerrainPoint,position:TerrainPoint):TerrainSample {
  assertTerrainGrid(g);
  const c=Math.floor((xy[0]-g.west)/g.dx),r=Math.floor((g.north-xy[1])/g.dy);
  const base:TerrainSample={position,cellCenter:null,column:null,row:null,elevationM:null,slopePct:null,status:"outside"};
  if(!xy.every(Number.isFinite)||c<0||r<0||c>=g.width||r>=g.height)return base;
  const center=proj4(g.crs,"EPSG:4326",[g.west+(c+.5)*g.dx,g.north-(r+.5)*g.dy]) as TerrainPoint;
  const z=Number(g.band[r*g.width+c]);
  if(!validSample(z,g.noData))return {...base,column:c,row:r,cellCenter:center,status:"nodata"};
  const slope=slopePercentAt(g.band,g.width,g.height,c,r,g.dx,g.dy,g.noData);
  return {...base,column:c,row:r,cellCenter:center,elevationM:z,slopePct:Number.isFinite(slope)?slope:null,status:Number.isFinite(slope)?"ok":"neighbours"};
}
export function sampleTerrain(g:TerrainGrid,position:TerrainPoint){return sampleTerrainAtXY(g,projectTerrainPoint(g,position),position);}
export function projectedPolygonArea(points:TerrainPoint[]):number {
  if(points.length<3)return 0;const [ox,oy]=points[0];let twice=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];twice+=(a[0]-ox)*(b[1]-oy)-(b[0]-ox)*(a[1]-oy);}
  return Math.abs(twice)/2;
}
/** Analyse native cells only. No interpolation, smoothing, outlier removal or mutations of the raster. */
export async function analyseSlopePolygonXY(g:TerrainGrid,polygon:TerrainPoint[],options:{signal?:AbortSignal;onProgress?:(percent:number)=>void}={}):Promise<SlopeAreaSummary> {
  assertTerrainGrid(g);
  if(polygon.length<3||polygon.length>200||!polygon.every(p=>p.length===2&&p.every(Number.isFinite)))throw Error("Delimite uma área válida com 3 a 200 pontos.");
  const polygonAreaM2=projectedPolygonArea(polygon);if(polygonAreaM2<=0)throw Error("O contorno não delimita uma área.");
  const pixel=polygon.map(p=>[(p[0]-g.west)/g.dx,(g.north-p[1])/g.dy] as TerrainPoint);
  const top=Math.max(0,Math.ceil(Math.min(...pixel.map(p=>p[1]))-.5));
  const bottom=Math.min(g.height-1,Math.ceil(Math.max(...pixel.map(p=>p[1]))-.5)-1);
  const classes=SLOPE_CLASSES.map(c=>({label:c.label,color:c.color,cells:0,areaM2:0,validSharePct:0}));
  let cells=0,validCells=0,sum=0,min=Infinity,max=-Infinity;
  for(let row=top;row<=bottom;row++){
    options.signal?.throwIfAborted();const scan=row+.5,intersections:number[]=[];
    for(let i=0;i<pixel.length;i++){
      const a=pixel[i],b=pixel[(i+1)%pixel.length];
      if((a[1]<=scan&&b[1]>scan)||(b[1]<=scan&&a[1]>scan))intersections.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    intersections.sort((a,b)=>a-b);
    for(let i=0;i+1<intersections.length;i+=2){
      const start=Math.max(0,Math.ceil(intersections[i]-.5)),end=Math.min(g.width-1,Math.ceil(intersections[i+1]-.5)-1);
      for(let col=start;col<=end;col++){
        cells++;const slope=slopePercentAt(g.band,g.width,g.height,col,row,g.dx,g.dy,g.noData);
        if(!Number.isFinite(slope))continue;
        validCells++;sum+=slope;min=Math.min(min,slope);max=Math.max(max,slope);
        const index=SLOPE_CLASSES.findIndex(c=>slope<=c.max);classes[index<0?5:index].cells++;
      }
    }
    if((row-top)%32===0){options.onProgress?.(100*(row-top+1)/Math.max(1,bottom-top+1));await new Promise<void>(resolve=>setTimeout(resolve,0));}
  }
  options.signal?.throwIfAborted();const cellArea=g.dx*g.dy,validAreaM2=validCells*cellArea;
  for(const c of classes){c.areaM2=c.cells*cellArea;c.validSharePct=validCells?100*c.cells/validCells:0;}
  options.onProgress?.(100);
  return {method:"Horn 3x3 / native DTM / cell-centre polygon mask",polygonAreaM2,gridAreaM2:cells*cellArea,validAreaM2,
    unavailableAreaM2:Math.max(0,polygonAreaM2-validAreaM2),coveragePct:Math.min(100,100*validAreaM2/polygonAreaM2),cells,validCells,
    meanPct:validCells?sum/validCells:null,minPct:validCells?min:null,maxPct:validCells?max:null,classes,
    resolutionM:[g.dx,g.dy],sourceCrs:g.sourceCrs};
}
export function analyseSlopePolygon(g:TerrainGrid,polygon:TerrainPoint[],options:{signal?:AbortSignal;onProgress?:(percent:number)=>void}={}){
  return analyseSlopePolygonXY(g,polygon.map(p=>projectTerrainPoint(g,p)),options);
}

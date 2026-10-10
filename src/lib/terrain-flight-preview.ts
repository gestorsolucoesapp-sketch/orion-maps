import type {Coordinate} from "./flight-plan";
import {assertTerrainGrid,projectTerrainPoint,sampleTerrain,sampleTerrainAtXY,type TerrainGrid} from "./terrain-analysis";

export type TerrainFlightPoint={distanceM:number;groundM:number;relativeHeightM:number;position:Coordinate};
export type TerrainFlightPreview={points:TerrainFlightPoint[];distanceM:number;spacingM:number;homeGroundM:number;minGroundM:number;maxGroundM:number;minRelativeHeightM:number;maxRelativeHeightM:number;missingSamples:number;complete:boolean};

/** Draft altitude schedule from a supplied DTM. It is never a validated flight command. */
export async function previewTerrainFlight(grid:TerrainGrid,route:Coordinate[],home:Coordinate,targetAglM:number):Promise<TerrainFlightPreview>{
 assertTerrainGrid(grid);
 if(route.length<2||route.length>200||!Number.isFinite(targetAglM)||targetAglM<1||targetAglM>500)throw Error("Revise a rota e a altura antes de analisar o relevo.");
 const homeSample=sampleTerrain(grid,home);
 if(homeSample.elevationM===null)throw Error("O ponto H de decolagem está fora do DTM ou sem elevação válida.");
 const xy=route.map(p=>projectTerrainPoint(grid,p));
 const segments=xy.slice(1).map((end,i)=>({start:xy[i],end,length:Math.hypot(end[0]-xy[i][0],end[1]-xy[i][1])}));
 const distanceM=segments.reduce((sum,s)=>sum+s.length,0);
 if(distanceM<1)throw Error("A rota precisa ter pelo menos 1 m para analisar o relevo.");
 const spacingM=Math.max(5,Math.max(grid.dx,grid.dy),distanceM/4800);
 const points:TerrainFlightPoint[]=[];
 let covered=0,missingSamples=0,minGroundM=Infinity,maxGroundM=-Infinity,minRelativeHeightM=Infinity,maxRelativeHeightM=-Infinity;
 for(let segmentIndex=0;segmentIndex<segments.length;segmentIndex++){
  const segment=segments[segmentIndex],steps=Math.max(1,Math.ceil(segment.length/spacingM));
  for(let step=segmentIndex===0?0:1;step<=steps;step++){
   const t=step/steps,position:Coordinate=[route[segmentIndex][0]+(route[segmentIndex+1][0]-route[segmentIndex][0])*t,route[segmentIndex][1]+(route[segmentIndex+1][1]-route[segmentIndex][1])*t];
   const xyPoint:[number,number]=[segment.start[0]+(segment.end[0]-segment.start[0])*t,segment.start[1]+(segment.end[1]-segment.start[1])*t];
   const groundM=sampleTerrainAtXY(grid,xyPoint,position).elevationM;
   if(groundM===null){missingSamples++;continue;}
   const relativeHeightM=targetAglM+groundM-homeSample.elevationM;
   minGroundM=Math.min(minGroundM,groundM);maxGroundM=Math.max(maxGroundM,groundM);
   minRelativeHeightM=Math.min(minRelativeHeightM,relativeHeightM);maxRelativeHeightM=Math.max(maxRelativeHeightM,relativeHeightM);
   points.push({distanceM:covered+segment.length*t,groundM,relativeHeightM,position});
  }
  covered+=segment.length;
  if(segmentIndex%12===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 return {points,distanceM,spacingM,homeGroundM:homeSample.elevationM,minGroundM:points.length?minGroundM:NaN,maxGroundM:points.length?maxGroundM:NaN,minRelativeHeightM:points.length?minRelativeHeightM:NaN,maxRelativeHeightM:points.length?maxRelativeHeightM:NaN,missingSamples,complete:missingSamples===0&&points.length>0};
}

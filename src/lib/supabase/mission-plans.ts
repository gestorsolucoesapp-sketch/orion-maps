import {supabaseRequest} from "./surveys";
import {generateGrid,type Coordinate} from "@/lib/flight-plan";
import {calculateGsd} from "@/lib/gsd";
import {corridorRoute,orbitRoute} from "@/lib/advanced-missions";

export type MissionPlanCandidate={
  id:string;
  name:string;
  kind:string;
  target_id?:string|null;
  plan:{
    points?:[number,number][];
    mode?:string;
    drone?:string;
    [key:string]:unknown;
  }|null;
  created_at:string;
};

export async function listMissionPlanCandidates(token:string){
  return supabaseRequest<MissionPlanCandidate[]>(
    "/rest/v1/mission_versions?select=id,name,kind,plan,target_id,created_at&kind=eq.preview&order=created_at.desc&limit=100",
    token
  );
}

function savedFlightLegs(plan:MissionPlanCandidate["plan"]):Coordinate[][]{
  try{
    if(!plan)return [];
    const points=plan.points;
    if(!Array.isArray(points)||points.length<2||points.length>200||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))return [];
    if(plan.mode==="manual")return [points];
    if(plan.mode==="orbit")return orbitRoute(points,typeof plan.orbitSamples==="number"?plan.orbitSamples:36).legs;
    const settings=plan.settings as Record<string,number>|undefined;
    if(!settings)return [];
    const gsd=calculateGsd({diagonalFov:settings.diagonalFov,sensorWidth:settings.sensorWidth,sensorHeight:settings.sensorHeight,focalLength:settings.focal,imageWidth:settings.imageWidth,imageHeight:settings.imageHeight,height:settings.height,frontOverlap:settings.front,sideOverlap:settings.side,speed:settings.speed,targetGsd:3});
    if(plan.mode==="corridor")return corridorRoute(points,Number(plan.corridorWidth),gsd.lineSpacing).legs;
    if(!["grid","double","oblique"].includes(plan.mode??""))return [];
    const exclusions=plan.exclusions;
    if(exclusions!==undefined&&(!Array.isArray(exclusions)||!exclusions.every(ring=>Array.isArray(ring)&&ring.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))))return [];
    const legs=generateGrid(points,{spacing:gsd.lineSpacing,photoSpacing:gsd.photoSpacing,bearing:settings.bearing,speed:settings.speed,doubleGrid:plan.mode==="double"||plan.mode==="oblique",perimeterPass:plan.perimeterPass===true},exclusions as Coordinate[][]|undefined).legs;
    return legs.flat().length<=2000?legs:[];
  }catch{return [];}
}

export function findMissionBoundaryForBounds(
  rows:MissionPlanCandidate[],
  bounds:{west:number;south:number;east:number;north:number}|null,
  surveyId?:string
){
  if(!bounds)return null;
  const marginLon=(bounds.east-bounds.west)*0.08;
  const marginLat=(bounds.north-bounds.south)*0.08;
  for(const row of rows){
    if(surveyId&&row.target_id!==surveyId)continue;
    const points=row.plan?.points;
    if(!Array.isArray(points)||points.length<3)continue;
    const valid=points.every(p=>Array.isArray(p)&&p.length===2&&
      Number.isFinite(p[0])&&Number.isFinite(p[1])&&
      p[0]>=bounds.west-marginLon&&p[0]<=bounds.east+marginLon&&
      p[1]>=bounds.south-marginLat&&p[1]<=bounds.north+marginLat
    );
    if(valid)return {id:row.id,name:row.name,points,legs:savedFlightLegs(row.plan),created_at:row.created_at};
  }
  return null;
}

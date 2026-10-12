import {supabaseRequest} from "./surveys";

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
    if(valid)return {id:row.id,name:row.name,points,created_at:row.created_at};
  }
  return null;
}

import {measureDrawing,requireMeasurement,type Measurement,type MeasurePoint} from "./map-measurement";

export type MeasurementImageSource="satellite_reference"|"orthophoto";
export type ComparisonMeasurement={
  id:string;name:string;survey_id:string|null;created_at:string;
  image_source:MeasurementImageSource|null;measurement:Measurement;
};
export type GeoBounds={west:number;south:number;east:number;north:number};
export type ComparisonSide={record:ComparisonMeasurement;area_m2:number;area_ha:number;perimeter_m:number};
export type AreaComparison={before:ComparisonSide|null;after:ComparisonSide|null;delta_m2:number|null;delta_ha:number|null;delta_percent:number|null;visual_only:boolean};

function selected(rows:ComparisonMeasurement[],id:string|undefined,surveyId:string,source:MeasurementImageSource):ComparisonSide|null{
  const row=rows.find(value=>value.id===id&&value.survey_id===surveyId&&value.image_source===source&&value.measurement.kind==="polygon");
  if(!row)return null;
  try{
    const metrics=measureDrawing(requireMeasurement(row.measurement));
    if(!metrics.complete||metrics.area_m2===null||metrics.perimeter_m===null)return null;
    return {record:row,area_m2:metrics.area_m2,area_ha:metrics.area_m2/10000,perimeter_m:metrics.perimeter_m};
  }catch{return null;}
}

function samePolygon(a:MeasurePoint[],b:MeasurePoint[]):boolean{
  if(a.length!==b.length)return false;
  const matches=(start:number,direction:number)=>a.every((point,i)=>{
    const other=b[(start+direction*i+b.length*2)%b.length];
    return point[0]===other[0]&&point[1]===other[1];
  });
  return b.some((_,index)=>matches(index,1)||matches(index,-1));
}

export function compareSavedAreas(rows:ComparisonMeasurement[],surveyId:string,beforeId?:string,afterId?:string):AreaComparison{
  const before=selected(rows,beforeId,surveyId,"satellite_reference");
  const after=selected(rows,afterId,surveyId,"orthophoto");
  const visual_only=!!before&&!!after&&samePolygon(before.record.measurement.points,after.record.measurement.points);
  const delta_m2=before&&after?(visual_only?0:after.area_m2-before.area_m2):null;
  return {before,after,delta_m2,delta_ha:delta_m2===null?null:delta_m2/10000,delta_percent:delta_m2===null||!before?null:100*delta_m2/before.area_m2,visual_only};
}

export function validGeoBounds(raw:unknown):GeoBounds|null{
  if(!raw||typeof raw!=="object")return null;
  const b=raw as Partial<GeoBounds>;
  if(![b.west,b.south,b.east,b.north].every(v=>typeof v==="number"&&Number.isFinite(v)))return null;
  if(b.west!>=b.east!||b.south!>=b.north!||Math.abs(b.south!)>80||Math.abs(b.north!)>80)return null;
  return b as GeoBounds;
}

export function comparisonFrame(bounds:GeoBounds,points:MeasurePoint[]=[],aspect=3/2):GeoBounds{
  if(!Number.isFinite(aspect)||aspect<=0)throw Error("Proporção de quadro inválida.");
  let west=bounds.west,east=bounds.east,south=bounds.south,north=bounds.north;
  for(const [lon,lat] of points){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
  const midX=(west+east)/2,midY=(south+north)/2;
  const width=Math.max(east-west,(north-south)*aspect),height=width/aspect;
  return {west:midX-width/2,east:midX+width/2,south:midY-height/2,north:midY+height/2};
}

export function pointPercent(point:MeasurePoint,bounds:GeoBounds):[number,number]{
  return [100*(point[0]-bounds.west)/(bounds.east-bounds.west),100*(bounds.north-point[1])/(bounds.north-bounds.south)];
}

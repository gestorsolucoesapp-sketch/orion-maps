import {orthophotoPreviewUrl} from "./orthophoto-preview-url";
import type {ProcessingResult} from "./supabase/processing-results";
import type {ProcessingJob} from "./supabase/processing-jobs";

export type AgroPreview={url:string;bounds:{west:number;south:number;east:number;north:number};job_id:string;result_id:string};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Read-only view of the SAME completed job shown in Results. Never copy or update stored products. */
export function selectAgroPreview(surveyId:string,jobs:Pick<ProcessingJob,"id"|"survey_id"|"status">[],results:ProcessingResult[],requestedJobId?:string|null):AgroPreview|null{
  // Jobs arrive newest first, exactly as in the Results page. Never silently use an older job.
  const job=jobs.find(j=>j.survey_id===surveyId&&j.status==="completed"&&(!requestedJobId||j.id===requestedJobId));
  if(!job)return null;
  for(const r of results){
    if(r.survey_id!==surveyId||r.job_id!==job.id||r.kind!=="orthophoto"||!uuid.test(r.id)||!["image/png","image/jpeg","image/webp"].includes(r.mime_type||""))continue;
    if(!r.preview_url&&!r.original_preview_url)continue;
    const b=r.metadata?.bounds_wgs84 as AgroPreview["bounds"]|undefined;
    if(!b||![b.west,b.south,b.east,b.north].every(v=>typeof v==="number"&&Number.isFinite(v))||b.west>=b.east||b.south>=b.north||Math.abs(b.west)>180||Math.abs(b.east)>180||Math.abs(b.south)>85||Math.abs(b.north)>85)continue;
    const url=orthophotoPreviewUrl(r);
    if(url)return {url,bounds:{...b},job_id:job.id,result_id:r.id};
  }
  return null;
}

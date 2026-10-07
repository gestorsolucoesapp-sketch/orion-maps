type Result={id:string;kind:string;created_at?:string;original_preview_url?:string|null;preview_url?:string|null};
/** Same URL for the card and map. Source downloads keep their original URLs. */
export function orthophotoPreviewUrl(result:Result):string|null{
  if(result.kind==="orthophoto"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id)){
    return `/api/processing-preview/${result.id}?v=${encodeURIComponent(result.created_at||"1")}`;
  }
  return result.original_preview_url||result.preview_url||null;
}

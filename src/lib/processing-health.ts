import type {ProcessingDevice} from "./supabase/processing-devices";

/** Pure shared code: importing it must never pull server authentication into the browser. */
export function isProcessingDeviceOnline(device:ProcessingDevice,now:number){
  if(!device.enabled||!device.last_seen)return false;
  const seen=Date.parse(device.last_seen);
  return Number.isFinite(seen)&&now-seen>=-30000&&now-seen<90000&&device.capabilities.nodeodm_reachable!==false;
}

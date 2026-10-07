import type {ProcessingActivity} from "./processing-activity";

export const ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
const MAX_SAMPLE_GAP_MS = 25_000;
export type ActivityChartPoint = {at:number; cpu:number|null; files:number|null};
export type ActivityChart = {
  points:ActivityChartPoint[]; sampledAt:number|null; start:number; end:number;
  cpuMax:number; filesMax:number; cpuMean:number|null; cpuPeak:number|null;
  filesDelta:number|null; samples:number;
};
function finiteNonnegative(value:unknown):value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function cpu(value:unknown):number|null {
  return finiteNonnegative(value) && value <= 1_000_000 ? value : null;
}
function files(value:unknown):number|null {
  return finiteNonnegative(value) && Number.isSafeInteger(value) ? value : null;
}
export function axisCeiling(value:number, minimum:number):number {
  if (!finiteNonnegative(value) || value <= minimum) return minimum;
  const unit = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / unit) * unit;
}
/** Anchored to the received sample, NOT the browser clock. No invented readings. */
export function activityChart(sample:ProcessingActivity|null|undefined, taskId:string|null):ActivityChart {
  const empty:ActivityChart={points:[],sampledAt:null,start:0,end:0,cpuMax:100,filesMax:10,cpuMean:null,cpuPeak:null,filesDelta:null,samples:0};
  if (!sample || sample.schema_version!==1 || !taskId || sample.engine_task_uuid!==taskId) return empty;
  const end=Date.parse(sample.sampled_at);
  if (!Number.isFinite(end)) return empty;
  const start=end-ACTIVITY_WINDOW_MS, byTime=new Map<number,ActivityChartPoint>();
  const history=Array.isArray(sample.history)?sample.history.slice(-120):[];
  for (const entry of history) {
    if (!entry || typeof entry !== "object") continue;
    const at=Date.parse(entry.at);
    if (!Number.isFinite(at) || at<start || at>end) continue;
    byTime.set(at,{at,cpu:cpu(entry.cpu_percent),files:files(entry.depth_maps)});
  }
  byTime.set(end,{at:end,cpu:cpu(sample.cpu_percent),files:files(sample.depth_maps)});
  const points=[...byTime.values()].sort((a,b)=>a.at-b.at);
  const cpuValues=points.flatMap(p=>p.cpu===null?[]:[p.cpu]);
  const fileValues=points.flatMap(p=>p.files===null?[]:[p.files]);
  let filesDelta:number|null=null;
  // Report a change only across a complete contiguous sequence of file readings.
  if (points.length>=2 && points.every(p=>p.files!==null) && points.slice(1).every((p,i)=>p.at-points[i].at<=MAX_SAMPLE_GAP_MS && p.files!>=points[i].files!)) {
    filesDelta=points.at(-1)!.files!-points[0].files!;
  }
  const cpuPeak=cpuValues.length?Math.max(...cpuValues):null;
  return {points,sampledAt:end,start,end,cpuMax:axisCeiling(cpuPeak??0,100),filesMax:axisCeiling(fileValues.length?Math.max(...fileValues):0,10),cpuMean:cpuValues.length?cpuValues.reduce((a,b)=>a+b,0)/cpuValues.length:null,cpuPeak,filesDelta,samples:points.length};
}
/** Missing samples break the line; file inventory is a staircase, not smoothed. */
export function activityChartPaths(chart:ActivityChart, metric:"cpu"|"files", width=300, height=72):string[] {
  if (!chart.points.length || chart.end<=chart.start || !Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0) return [];
  const max=metric==="cpu"?chart.cpuMax:chart.filesMax;
  const paths:string[]=[];let path="",previous:ActivityChartPoint|null=null;
  for (const p of chart.points) {
    const value=p[metric];
    if (value===null) {if(path)paths.push(path);path="";previous=null;continue;}
    const x=((p.at-chart.start)/(chart.end-chart.start)*width).toFixed(2);
    const y=(height-value/max*height).toFixed(2);
    if (!previous || p.at-previous.at>MAX_SAMPLE_GAP_MS) {
      if(path)paths.push(path);path=`M${x},${y}`;
    } else path+=metric==="files"?`H${x}V${y}`:`L${x},${y}`;
    previous=p;
  }
  if(path)paths.push(path);
  return paths;
}
export function chartTime(timestamp:number|null):string {
  return timestamp!==null && Number.isFinite(timestamp)?new Date(timestamp).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour12:false}):"—";
}
const units:Record<string,number>={B:1,kB:1000,KB:1000,MB:1e6,GB:1e9,TB:1e12,KiB:1024,MiB:1024**2,GiB:1024**3,TiB:1024**4};
export function memoryUsagePercent(value:string|null|undefined):number|null {
  if (typeof value!=="string") return null;
  const match=/^\s*(\d+(?:\.\d+)?)\s*(B|kB|KB|MB|GB|TB|KiB|MiB|GiB|TiB)\s*\/\s*(\d+(?:\.\d+)?)\s*(B|kB|KB|MB|GB|TB|KiB|MiB|GiB|TiB)\s*$/.exec(value);
  if (!match) return null;
  const used=Number(match[1])*units[match[2]],limit=Number(match[3])*units[match[4]];
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit<=0) return null;
  return used/limit*100;
}

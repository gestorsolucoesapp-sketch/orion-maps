"use client";

import {useEffect,useRef,useState} from "react";
import type {ProcessingResult} from "@/lib/supabase/processing-results";
import {clearFreshProcessingUrl,freshProcessingUrl} from "@/lib/processing-fresh-url";

type CameraState={x:number;y:number;z:number;tx:number;ty:number;tz:number;fovY:number};
type ViewerLike={
  load:(url:string)=>Promise<void>;
  dispose:()=>void;
  setColorMode?:(mode:"rgb"|"height"|"intensity"|"classification")=>string;
  getAvailableColorModes?:()=>string[];
  getCameraState?:()=>CameraState|null;
  applyCameraState?:(state:CameraState)=>void;
};

export default function PointCloudViewer({source}:{source:Pick<ProcessingResult,"id"|"survey_id">}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const viewerRef=useRef<ViewerLike|null>(null);
  const overviewRef=useRef<CameraState|null>(null);
  const [status,setStatus]=useState("Preparando visualizador 3D…");
  const [progress,setProgress]=useState(0);
  const [mode,setMode]=useState("rgb");
  const [available,setAvailable]=useState<string[]>([]);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    async function start(){
      try{
        if(!canvasRef.current)return;
        if(!("gpu" in navigator))throw new Error("Este navegador não disponibiliza WebGPU para a visualização 3D.");
        setError("");setStatus("Carregando nuvem de pontos…");setProgress(0);
        const importer=new Function("u","return import(u)") as (url:string)=>Promise<Record<string,unknown>>;
        const mod=await importer("https://cdn.jsdelivr.net/npm/@lazstream/viewer@1.4.0/+esm");
        if(cancelled)return;
        const LazstreamViewer=(mod as {LazstreamViewer?:{create:(canvas:HTMLCanvasElement,options?:Record<string,unknown>)=>Promise<ViewerLike>}}).LazstreamViewer;
        if(!LazstreamViewer)throw new Error("Visualizador 3D indisponível.");
        const viewer=await LazstreamViewer.create(canvasRef.current,{
          workerCount:Math.max(1,Math.min(2,(navigator.hardwareConcurrency||4)-1)),
          maxFetches:6,
          ringBufferCapacity:192*1024*1024,
          sseThreshold:1.0,
          splatRadius:3,
          voxelLod:true,
          colorMode:"height",
          onStateChange:(state:string,message?:string)=>{
            if(cancelled)return;
            if(state==="streaming")setStatus("Pronto · arraste para girar · pinça para zoom");
            else setStatus(message||state);
          },
          onProgress:(loaded:number,total:number,phase:string)=>{
            if(cancelled)return;
            setProgress(total>0?Math.max(0,Math.min(100,Math.round((loaded/total)*100))):0);
            if(phase)setStatus(phase);
          },
          onError:(err:Error)=>{if(!cancelled)setError(err.message||"Falha ao abrir a nuvem 3D.");},
        });
        viewerRef.current=viewer;
        const url=await freshProcessingUrl(source,"download");
        if(cancelled)return;
        await viewer.load(url);
        if(cancelled)return;
        const modes=viewer.getAvailableColorModes?.()||["height","intensity","classification"];
        setAvailable(modes);
        const preferred=modes.includes("rgb")?"rgb":modes.includes("height")?"height":modes[0]||"height";
        const resolved=viewer.setColorMode?.(preferred as "rgb"|"height"|"intensity"|"classification")||preferred;
        setMode(resolved);
        setProgress(100);
        const initial=viewer.getCameraState?.()||null;
        overviewRef.current=initial;
        if(initial&&viewer.applyCameraState){
          const k=.52;
          viewer.applyCameraState({
            ...initial,
            x:initial.tx+(initial.x-initial.tx)*k,
            y:initial.ty+(initial.y-initial.ty)*k,
            z:initial.tz+(initial.z-initial.tz)*k,
          });
        }
        setStatus("Pronto · mais detalhes carregam conforme você aproxima");
      }catch(e){
        if(cancelled)return;
        const msg=e instanceof Error?e.message:"Não foi possível abrir a nuvem de pontos.";
        setError(msg);
        setStatus("");
      }
    }
    void start();
    return()=>{cancelled=true;viewerRef.current?.dispose();viewerRef.current=null;};
  },[source,retry]);

  function changeMode(next:"rgb"|"height"|"intensity"|"classification"){
    const resolved=viewerRef.current?.setColorMode?.(next)||next;
    setMode(resolved);
  }

  function zoomDetail(){
    const viewer=viewerRef.current,state=viewer?.getCameraState?.();
    if(!viewer?.applyCameraState||!state)return;
    const k=.62;
    viewer.applyCameraState({...state,x:state.tx+(state.x-state.tx)*k,y:state.ty+(state.y-state.ty)*k,z:state.tz+(state.z-state.tz)*k});
    setStatus("Carregando detalhe da área aproximada…");
  }

  function showOverview(){
    const viewer=viewerRef.current,state=overviewRef.current;
    if(!viewer?.applyCameraState||!state)return;
    viewer.applyCameraState(state);
    setStatus("Visão geral · aproxime para carregar mais pontos");
  }

  const labels:Record<string,string>={rgb:"RGB",height:"Altura",intensity:"Intensidade",classification:"Classificação"};

  return <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-[#0f1719]">
    <div className="relative">
      <canvas ref={canvasRef} className="block h-[58vh] min-h-[420px] max-h-[700px] w-full touch-none bg-[#080b0f]"/>
      {!error&&progress<100&&<div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-black/55 p-3 text-xs text-white backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3"><span>{status}</span><strong>{progress}%</strong></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all" style={{width:progress+"%"}}/></div>
      </div>}
      {error&&<div className="absolute inset-0 grid place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-red-400/30 bg-black/70 p-5 text-center text-sm leading-6 text-white backdrop-blur">
          <strong className="block text-base">Não foi possível abrir a nuvem 3D</strong>
          <span className="mt-2 block text-white/75">{error}</span>
          <button type="button" className="mt-3 rounded-lg bg-white px-3 py-2 font-semibold text-slate-950" onClick={()=>{clearFreshProcessingUrl(source.id);setRetry(v=>v+1);}}>Tentar novamente</button>
        </div>
      </div>}
    </div>
    <div className="border-t border-white/10 bg-black/25 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-white/70">{status||"Visualizador 3D"}</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={zoomDetail} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-100">＋ Aproximar detalhe</button>
          <button type="button" onClick={showOverview} className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white">Enquadrar tudo</button>
        </div>
        {available.length>0&&<div className="flex flex-wrap gap-2">
          {available.map(item=><button key={item} type="button" onClick={()=>changeMode(item as "rgb"|"height"|"intensity"|"classification")} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${mode===item?"bg-white text-slate-950":"bg-white/10 text-white"}`}>{labels[item]||item}</button>)}
        </div>}
      </div>
    </div>
  </div>;
}

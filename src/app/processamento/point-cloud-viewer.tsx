"use client";

import {useEffect,useRef,useState} from "react";

type ViewerLike={
  load:(url:string)=>Promise<void>;
  dispose:()=>void;
  setColorMode?:(mode:"rgb"|"height"|"intensity"|"classification")=>string;
  getAvailableColorModes?:()=>string[];
};

export default function PointCloudViewer({url}:{url:string}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const viewerRef=useRef<ViewerLike|null>(null);
  const [status,setStatus]=useState("Preparando visualizador 3D…");
  const [progress,setProgress]=useState(0);
  const [mode,setMode]=useState("rgb");
  const [available,setAvailable]=useState<string[]>([]);
  const [error,setError]=useState("");

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
        await viewer.load(url);
        if(cancelled)return;
        const modes=viewer.getAvailableColorModes?.()||["height","intensity","classification"];
        setAvailable(modes);
        const preferred=modes.includes("rgb")?"rgb":modes.includes("height")?"height":modes[0]||"height";
        const resolved=viewer.setColorMode?.(preferred as "rgb"|"height"|"intensity"|"classification")||preferred;
        setMode(resolved);
        setProgress(100);
        setStatus("Pronto · arraste para girar · pinça para zoom");
      }catch(e){
        if(cancelled)return;
        const msg=e instanceof Error?e.message:"Não foi possível abrir a nuvem de pontos.";
        setError(msg);
        setStatus("");
      }
    }
    void start();
    return()=>{cancelled=true;viewerRef.current?.dispose();viewerRef.current=null;};
  },[url]);

  function changeMode(next:"rgb"|"height"|"intensity"|"classification"){
    const resolved=viewerRef.current?.setColorMode?.(next)||next;
    setMode(resolved);
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
        </div>
      </div>}
    </div>
    <div className="border-t border-white/10 bg-black/25 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-white/70">{status||"Visualizador 3D"} · detalhe automático</span>
        {available.length>0&&<div className="flex flex-wrap gap-2">
          {available.map(item=><button key={item} type="button" onClick={()=>changeMode(item as "rgb"|"height"|"intensity"|"classification")} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${mode===item?"bg-white text-slate-950":"bg-white/10 text-white"}`}>{labels[item]||item}</button>)}
        </div>}
      </div>
    </div>
  </div>;
}

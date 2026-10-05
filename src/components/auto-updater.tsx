"use client";

import {useEffect,useRef,useState} from "react";

type Props={currentBuild:string};

export default function AutoUpdater({currentBuild}:Props){
  const [updating,setUpdating]=useState(false);
  const checking=useRef(false);

  useEffect(()=>{
    if(!currentBuild||currentBuild==="local")return;

    let disposed=false;
    async function check(){
      if(disposed||checking.current)return;
      checking.current=true;
      try{
        const response=await fetch("/api/version?ts="+Date.now(),{cache:"no-store"});
        if(!response.ok)return;
        const data=await response.json() as {build?:string};
        if(data.build&&data.build!=="local"&&data.build!==currentBuild){
          setUpdating(true);
          window.setTimeout(()=>window.location.reload(),500);
        }
      }catch{
        // Falha de rede não deve interromper o uso do app.
      }finally{
        checking.current=false;
      }
    }

    void check();
    const interval=window.setInterval(()=>void check(),30000);
    const onVisible=()=>{if(document.visibilityState==="visible")void check();};
    const onFocus=()=>void check();
    document.addEventListener("visibilitychange",onVisible);
    window.addEventListener("focus",onFocus);

    return()=>{
      disposed=true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange",onVisible);
      window.removeEventListener("focus",onFocus);
    };
  },[currentBuild]);

  if(!updating)return null;
  return <div className="fixed inset-x-3 top-3 z-[100001] mx-auto max-w-sm rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 text-center text-sm font-semibold text-emerald-950 shadow-xl backdrop-blur">
    Nova versão encontrada · atualizando…
  </div>;
}

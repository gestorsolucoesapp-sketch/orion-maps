"use client";
import {useEffect,useRef,useTransition} from "react";
import {useRouter} from "next/navigation";

/** Keep active jobs responsive without repeatedly loading idle result pages. */
export default function LiveProcessingRefresh({active=false}:{active?:boolean}){
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const pendingRef=useRef(false),last=useRef(0);
  useEffect(()=>{pendingRef.current=pending;},[pending]);
  useEffect(()=>{
    function refresh(){
      if(document.visibilityState!=="visible"||!navigator.onLine||pendingRef.current||Date.now()-last.current<2000)return;
      last.current=Date.now();
      startTransition(()=>router.refresh());
    }
    const timer=window.setInterval(refresh,active?10000:300000);
    document.addEventListener("visibilitychange",refresh);
    window.addEventListener("focus",refresh);
    window.addEventListener("online",refresh);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",refresh);
      window.removeEventListener("focus",refresh);
      window.removeEventListener("online",refresh);
    };
  },[router,active]);
  return <p className="mb-3 text-xs text-slate-500" role="status">{pending?"Consultando o processador…":active?"Processamento em andamento · atualização a cada 10 s.":"Atualização a cada 5 min quando não há tarefa em andamento."}</p>;
}

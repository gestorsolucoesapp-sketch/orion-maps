"use client";
import {useEffect,useRef,useTransition} from "react";
import {useRouter} from "next/navigation";

/** Refresh both idle and busy pages; jobs can be started from another device. */
export default function LiveProcessingRefresh(){
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
    const timer=window.setInterval(refresh,10000);
    document.addEventListener("visibilitychange",refresh);
    window.addEventListener("focus",refresh);
    window.addEventListener("online",refresh);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",refresh);
      window.removeEventListener("focus",refresh);
      window.removeEventListener("online",refresh);
    };
  },[router]);
  return <p className="mb-3 text-xs text-slate-500" role="status">{pending?"Consultando o processador…":"Acompanhamento automático a cada 10 s com esta tela aberta."}</p>;
}

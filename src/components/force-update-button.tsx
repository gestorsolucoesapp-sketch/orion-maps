"use client";

import {useState} from "react";

export default function ForceUpdateButton(){
  const [busy,setBusy]=useState(false);
  async function forceUpdate(){
    if(busy)return;
    setBusy(true);
    try{
      if("serviceWorker" in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(async reg=>{
          try{await reg.update();}catch{}
        }));
      }
      if("caches" in window){
        try{
          const keys=await caches.keys();
          await Promise.all(keys.map(key=>caches.delete(key)));
        }catch{}
      }
      const url=new URL(window.location.href);
      url.searchParams.set("_refresh",Date.now().toString());
      window.location.replace(url.toString());
    }catch{
      window.location.reload();
    }
  }
  return <button type="button" onClick={()=>void forceUpdate()} disabled={busy} className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur disabled:opacity-60">
    {busy?"Atualizando…":"↻ Forçar atualização"}
  </button>;
}

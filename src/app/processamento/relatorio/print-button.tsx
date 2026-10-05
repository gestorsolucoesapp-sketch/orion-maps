"use client";

import {useState} from "react";

export default function PrintProjectButton(){
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function exportPdf(){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      // Aguarda mapas/imagens que ainda estejam renderizando antes de abrir a folha de impressão.
      const images=Array.from(document.images);
      await Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise<void>(resolve=>{
        const done=()=>resolve();img.addEventListener("load",done,{once:true});img.addEventListener("error",done,{once:true});
        window.setTimeout(done,4000);
      })));
      await new Promise(resolve=>window.setTimeout(resolve,350));
      window.print();
      setMessage("No iPhone: na prévia, toque em Compartilhar e escolha Salvar em Arquivos ou outro app.");
    }catch{
      setMessage("Não foi possível abrir a folha de impressão. Use o menu Compartilhar do navegador e escolha Imprimir.");
    }finally{
      window.setTimeout(()=>setBusy(false),700);
    }
  }

  return <div className="print-hide">
    <button type="button" onClick={()=>void exportPdf()} disabled={busy} className="rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
      {busy?"Preparando PDF…":"Exportar / Compartilhar PDF"}
    </button>
    {message&&<p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{message}</p>}
  </div>;
}

"use client";

import {useState} from "react";

export default function PrintProjectButton({requireImages=false}:{requireImages?:boolean}){
  const [message,setMessage]=useState("");

  function exportPdf(){
    setMessage("");
    try{
      const images=Array.from(document.images);
      if(requireImages&&images.some(img=>!img.complete||img.naturalWidth===0))throw new Error("A ortofoto recortada não carregou. Aguarde a imagem e tente novamente.");
      if(images.some(img=>!img.complete))throw new Error("As imagens do relatório ainda estão carregando. Aguarde e toque novamente.");
      // Mobile browsers need print() to run directly inside the user's tap.
      window.print();
      setMessage("No iPhone, use Compartilhar na prévia e escolha Salvar em Arquivos. No Android, escolha Salvar como PDF. Se nada abrir, abra esta página no Safari ou Chrome e toque novamente.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"Não foi possível preparar o PDF.");
    }
  }

  return <div className="print-hide">
    <button type="button" onClick={exportPdf} className="rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white">
      Exportar / Compartilhar PDF
    </button>
    {message&&<p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{message}</p>}
  </div>;
}

"use client";

export default function PrintProjectButton(){
  return <button type="button" onClick={()=>window.print()} className="print-hide rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white">Imprimir / Salvar em PDF</button>;
}

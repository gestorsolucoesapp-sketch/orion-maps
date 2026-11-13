"use client";
import dynamic from "next/dynamic";

const LayoutEditor=dynamic(()=>import("./layout-editor"),{ssr:false,loading:()=> <div style={{position:"fixed",inset:0,display:"grid",placeItems:"center",background:"#0f1720",color:"#fff",zIndex:60}}>Preparando o editor de layout…</div>});

export default function LayoutPage(){
  return <LayoutEditor/>;
}

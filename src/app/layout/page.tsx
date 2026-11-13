"use client";
import dynamic from "next/dynamic";
import {Component,type ReactNode} from "react";

const LayoutEditor=dynamic(()=>import("./layout-editor"),{ssr:false,loading:()=> <div style={{position:"fixed",inset:0,display:"grid",placeItems:"center",background:"#0f1720",color:"#fff",zIndex:60}}>Preparando o editor de layout…</div>});

/** Mostra o erro real na tela em vez da página genérica "não carregou". */
class Guard extends Component<{children:ReactNode},{error:string}>{
  state={error:""};
  static getDerivedStateFromError(e:unknown){return {error:e instanceof Error?`${e.name}: ${e.message}`:String(e)};}
  render(){
    if(!this.state.error)return this.props.children;
    return <div style={{position:"fixed",inset:0,zIndex:70,background:"#0f1720",color:"#fff",display:"grid",placeItems:"center",padding:24,textAlign:"center",fontFamily:"system-ui"}}>
      <div style={{maxWidth:440}}><b>O editor de layout encontrou um erro</b>
        <p style={{color:"#ffd84d",fontSize:13,wordBreak:"break-word"}}>{this.state.error}</p>
        <p style={{color:"#cfd6e2",fontSize:13}}>Tire um print desta tela e me mande.</p>
        <button onClick={()=>location.reload()} style={{border:0,borderRadius:10,background:"#ffc400",fontWeight:700,padding:"10px 16px"}}>Recarregar</button></div>
    </div>;
  }
}

export default function LayoutPage(){
  return <Guard><LayoutEditor/></Guard>;
}

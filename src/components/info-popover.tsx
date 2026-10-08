"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import "./info-popover.css";

/** Explicit touch/keyboard help, never a hover-only tooltip or a submit control. */
export default function InfoPopover({title,children,className=""}:{title:string;children:ReactNode;className?:string}){
 const [open,setOpen]=useState(false),id=useId(),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open||!dialog.current)return;
  const node=dialog.current,button=trigger.current;node.showModal();node.querySelector<HTMLButtonElement>("button")?.focus();
  return()=>{if(node.open)node.close();button?.focus({preventScroll:true});};
 },[open]);
 return <span className={`orion-info ${className}`}>
  <button ref={trigger} type="button" className="orion-info-trigger" aria-label={`Informações: ${title}`} title={title} aria-haspopup="dialog" aria-expanded={open} onClick={e=>{e.stopPropagation();setOpen(true);}}><span aria-hidden="true">i</span></button>
  {open&&createPortal(<dialog ref={dialog} className="orion-info-dialog" aria-labelledby={id} onClose={()=>setOpen(false)} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget)setOpen(false);}}>
   <div className="orion-info-content"><header><h2 id={id}>{title}</h2><button type="button" aria-label={`Fechar informações: ${title}`} onClick={()=>setOpen(false)}>×</button></header><div className="orion-info-body">{children}</div></div>
  </dialog>,document.body)}
 </span>;
}

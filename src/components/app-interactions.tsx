"use client";

import {useEffect,useState} from "react";
import {usePathname,useSearchParams} from "next/navigation";

export default function AppInteractions(){
  const pathname=usePathname();
  const search=useSearchParams();
  const [navigating,setNavigating]=useState(false);

  useEffect(()=>{setNavigating(false);},[pathname,search]);

  useEffect(()=>{
    function onClick(event:MouseEvent){
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const target=event.target as Element|null;
      const link=target?.closest("a") as HTMLAnchorElement|null;
      if(!link||link.target==="_blank"||link.hasAttribute("download"))return;
      if(!link.href||link.href.startsWith("mailto:")||link.href.startsWith("tel:"))return;
      const url=new URL(link.href,window.location.href);
      if(url.origin!==window.location.origin)return;
      if(url.pathname===window.location.pathname&&url.search===window.location.search&&url.hash)return;
      setNavigating(true);
    }
    function onSubmit(){setNavigating(true);}
    document.addEventListener("click",onClick,true);
    document.addEventListener("submit",onSubmit,true);
    return()=>{document.removeEventListener("click",onClick,true);document.removeEventListener("submit",onSubmit,true);};
  },[]);

  return <div className={`route-feedback ${navigating?"is-active":""}`} aria-hidden="true"><span/></div>;
}

"use client";

import type {ReactNode} from "react";

export type MapRailTool={
 id:string;
 label:string;
 icon:string;
 onClick:()=>void;
 disabled?:boolean;
 pressed?:boolean;
 divider?:boolean;
};

type Props={tools:MapRailTool[];panelTitle?:string;onClose:()=>void;children?:ReactNode};

export default function MapToolRail({tools,panelTitle,onClose,children}:Props){
 return <>
  <nav className="map-tool-rail" aria-label="Ferramentas do mapa" data-map-tool-ui>
   {tools.map(tool=><button key={tool.id} type="button" className={`map-rail-button${tool.divider?" map-rail-divider":""}`} title={tool.label} aria-label={tool.label} aria-pressed={tool.pressed} disabled={tool.disabled} onClick={tool.onClick}><span className="map-rail-icon" aria-hidden="true">{tool.icon}</span><span className="map-rail-label">{tool.label}</span></button>)}
  </nav>
  {panelTitle&&<aside className="map-rail-panel" aria-label={panelTitle} data-map-tool-ui><header><strong>{panelTitle}</strong><button type="button" aria-label="Fechar painel do mapa" onClick={onClose}>×</button></header>{children}</aside>}
 </>;
}

"use client";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {unzipSync,strFromU8} from "fflate";
import GoogleMapsImport from "@/components/google-maps-import";
import {esriImagery,streetBasemap} from "@/lib/basemaps";
import {
  DEFAULTS,bearingDeg,dist,emptyLayout,fmt,fromLngLat,loadLayouts,longestEdgeAngle,newId,parseKmlPolygon,perimeter,polygonArea,
  rectCorners,rotate,saveLayouts,toLngLat,toShapeFrame,type Pt,type Shape,type ShapeKind,type SiteLayout,
} from "@/lib/site-layout";
import "./layout-editor.css";

type Tool="pan"|"area"|ShapeKind;
type Drag=
  |{type:"move";id:string;start:Pt;orig:Shape}
  |{type:"resize";id:string;fixed:Pt}
  |{type:"rotate";id:string}
  |{type:"pt";id:string;index:number}
  |{type:"vertex";index:number};
type Gesture={x:number;y:number;start:Pt;moved:boolean;pointers:number};

const TOOLS:{id:Tool;icon:string;label:string}[]=[
  {id:"pan",icon:"✋",label:"Mover"},
  {id:"area",icon:"⬠",label:"Área"},
  {id:"machine",icon:"▬",label:"Máquina"},
  {id:"pallet",icon:"▦",label:"Palete"},
  {id:"rect",icon:"▭",label:"Retângulo"},
  {id:"circle",icon:"◯",label:"Círculo"},
  {id:"line",icon:"╱",label:"Linha"},
  {id:"dim",icon:"↔",label:"Cota"},
  {id:"text",icon:"T",label:"Texto"},
];
const HINT:Record<Tool,string>={
  pan:"Arraste o mapa. Toque numa peça para selecionar, mover e editar.",
  area:"Toque nos cantos da área. Toque no 1º ponto para fechar.",
  machine:"Toque para pôr uma máquina 3 × 10 m, ou arraste para desenhar o tamanho.",
  pallet:"Toque para pôr um palete 1,0 × 1,2 m.",
  rect:"Arraste para desenhar o retângulo (ou toque para 2 × 2 m).",
  circle:"Arraste do centro para fora (ou toque para Ø 1 m).",
  line:"Toque ponto a ponto. Toque de novo no último ponto (ou em Concluir) para terminar.",
  dim:"Toque nos dois pontos da cota.",
  text:"Toque onde quer o texto.",
};
const COLORS=["#3f7fc4","#d9483b","#f2c94c","#27ae60","#8e44ad","#e67e22","#ffffff","#1d2433"];
const snap=(n:number,s=0.05)=>Math.round(n/s)*s;
const clampSize=(n:number)=>Math.max(0.05,snap(n));

export default function LayoutEditor(){
  const box=useRef<HTMLDivElement>(null),mapRef=useRef<maplibregl.Map|null>(null),svgRef=useRef<SVGSVGElement>(null);
  const [layouts,setLayouts]=useState<SiteLayout[]>([]);
  const [cur,setCur]=useState<SiteLayout>(()=>emptyLayout());
  const [tool,setTool]=useState<Tool>("pan");
  const [sel,setSel]=useState<string|null>(null);
  const [draft,setDraft]=useState<Pt[]>([]);
  const [preview,setPreview]=useState<Shape|null>(null);
  const [,setTick]=useState(0);
  const [menu,setMenu]=useState(false);
  const [align,setAlign]=useState(true);
  const [basemap,setBasemap]=useState<"sat"|"street">("sat");
  const [msg,setMsg]=useState("");
  const [rep,setRep]=useState({n:3,gap:0.1,dir:"u" as "u"|"v"});
  const hist=useRef<SiteLayout[]>([]);
  const drag=useRef<Drag|null>(null);
  const gesture=useRef<Gesture|null>(null);
  const ready=useRef(false),skipSave=useRef(false);
  const [map,setMap]=useState<maplibregl.Map|null>(null);
  const S=useRef({cur,tool,draft,align});
  useEffect(()=>{S.current={cur,tool,draft,align};});

  const flash=useCallback((t:string)=>{setMsg(t);window.setTimeout(()=>setMsg(m=>m===t?"":m),3500);},[]);

  // ---------- carregar / salvar ----------
  useEffect(()=>{
    const list=loadLayouts();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento do aparelho
    setLayouts(list);
    if(list.length){const last=[...list].sort((a,b)=>b.updatedAt-a.updatedAt)[0];setCur(last);}
    ready.current=true;skipSave.current=true;
  },[]);
  useEffect(()=>{
    if(!ready.current)return;
    if(skipSave.current){skipSave.current=false;return;}
    setLayouts(prev=>{const next=[cur,...prev.filter(l=>l.id!==cur.id)];if(!saveLayouts(next))flash("Não consegui salvar no aparelho (memória cheia?).");return next;});
  },[cur,flash]);

  const commit=useCallback((fn:(l:SiteLayout)=>SiteLayout)=>{
    setCur(prev=>{hist.current.push(prev);if(hist.current.length>80)hist.current.shift();return {...fn(prev),updatedAt:Date.now()};});
  },[]);
  const live=useCallback((fn:(l:SiteLayout)=>SiteLayout)=>setCur(prev=>({...fn(prev),updatedAt:Date.now()})),[]);
  const undo=()=>{const p=hist.current.pop();if(p){setCur(p);setSel(null);}else flash("Nada para desfazer.");};

  // ---------- mapa ----------
  useEffect(()=>{
    if(!box.current)return;
    const m=new maplibregl.Map({container:box.current,center:[-46.888,-21.596],zoom:15,maxZoom:22,attributionControl:{compact:true},canvasContextAttributes:{preserveDrawingBuffer:true},
      style:{version:8,sources:{basemap:{type:"raster",tiles:[esriImagery.url],tileSize:256,maxzoom:esriImagery.maxzoom,attribution:esriImagery.attribution}},layers:[{id:"bg",type:"background",paint:{"background-color":"#c9ccc3"}},{id:"basemap",type:"raster",source:"basemap"}]}});
    mapRef.current=m;setMap(m);
    m.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:false}),"top-right");
    m.addControl(new maplibregl.NavigationControl({showZoom:false,visualizePitch:false}),"top-right");
    let raf=0;const redraw=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>setTick(t=>t+1));};
    m.on("move",redraw);m.on("resize",redraw);
    m.on("moveend",()=>{const c=m.getCenter();setCur(l=>({...l,view:{lng:c.lng,lat:c.lat,zoom:m.getZoom(),bearing:m.getBearing()}}));});
    m.once("load",()=>box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    m.on("click",()=>{if(S.current.tool==="pan")setSel(null);});
    m.touchPitch.disable();m.dragRotate.disable();
    return()=>{cancelAnimationFrame(raf);m.remove();mapRef.current=null;};
  },[]);

  // ir para o layout aberto
  const curId=cur.id;
  useEffect(()=>{
    const m=mapRef.current,l=S.current.cur;if(!m)return;
    if(l.view)m.jumpTo({center:[l.view.lng,l.view.lat],zoom:l.view.zoom,bearing:l.view.bearing});
    else if(l.origin)m.jumpTo({center:[l.origin.lng,l.origin.lat],zoom:19});
    hist.current=[];
  },[curId]);

  useEffect(()=>{
    const m=mapRef.current;if(!m)return;
    const apply=()=>{const b=basemap==="sat"?esriImagery:streetBasemap;if(m.getLayer("basemap"))m.removeLayer("basemap");if(m.getSource("basemap"))m.removeSource("basemap");m.addSource("basemap",{type:"raster",tiles:[b.url],tileSize:256,maxzoom:b.maxzoom,attribution:b.attribution});m.addLayer({id:"basemap",type:"raster",source:"basemap"});};
    if(m.isStyleLoaded())apply();else m.once("load",apply);
  },[basemap]);

  useEffect(()=>{const m=mapRef.current;if(!m)return;if(tool==="pan")m.dragPan.enable();else m.dragPan.disable();
    setDraft([]);setPreview(null);},[tool]);

  // ---------- conversões ----------
  const origin=cur.origin;
  const proj=(p:Pt):[number,number]=>{const m=map;if(!m||!origin)return [0,0];const q=m.project(toLngLat(origin,p));return [q.x,q.y];};
  const pxPerM=(()=>{const m=map;if(!m||!origin)return 1;const a=m.project([origin.lng,origin.lat]),b=m.project(toLngLat(origin,{x:1,y:0}));return Math.hypot(b.x-a.x,b.y-a.y)||1;})();

  const eventLocal=useCallback((clientX:number,clientY:number):Pt|null=>{
    const m=mapRef.current;if(!m)return null;const r=m.getCanvasContainer().getBoundingClientRect();
    const ll=m.unproject([clientX-r.left,clientY-r.top]);
    let o=S.current.cur.origin;
    if(!o){o={lng:ll.lng,lat:ll.lat};const oo=o;setCur(l=>({...l,origin:oo}));S.current.cur={...S.current.cur,origin:oo};}
    return fromLngLat(o,ll.lng,ll.lat);
  },[]);

  // ---------- desenho com o dedo no mapa ----------
  useEffect(()=>{
    const m=mapRef.current;if(!m)return;const el=m.getCanvasContainer();
    const active=new Set<number>();
    const baseRot=()=>S.current.align?S.current.cur.baseAngle:0;
    const shapeFromDrag=(kind:ShapeKind,a:Pt,b:Pt):Shape=>{
      const rot=baseRot();
      if(kind==="circle"){const r=Math.max(0.05,snap(dist(a,b)));return {id:newId(),kind,x:a.x,y:a.y,w:r*2,h:r*2,rot:0,color:DEFAULTS.circle.color};}
      const fa=toShapeFrame({x:0,y:0,rot},a),fb=toShapeFrame({x:0,y:0,rot},b);
      const w=clampSize(Math.abs(fb.u-fa.u)),h=clampSize(Math.abs(fb.v-fa.v));
      const c=rotate((fa.u+fb.u)/2,(fa.v+fb.v)/2,rot);
      const d=kind==="machine"?DEFAULTS.machine:DEFAULTS.rect;
      return {id:newId(),kind,x:c.x,y:c.y,w,h,rot,color:d.color,label:kind==="machine"?d.label:""};
    };
    const down=(e:PointerEvent)=>{
      active.add(e.pointerId);
      const t=S.current.tool;if(t==="pan")return;
      if(active.size>1){gesture.current=null;setPreview(null);return;}
      const p=eventLocal(e.clientX,e.clientY);if(!p)return;
      gesture.current={x:e.clientX,y:e.clientY,start:p,moved:false,pointers:1};
    };
    const move=(e:PointerEvent)=>{
      const g=gesture.current,t=S.current.tool;if(!g||active.size>1)return;
      if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>8)g.moved=true;
      if(g.moved&&(t==="rect"||t==="machine"||t==="circle")){const p=eventLocal(e.clientX,e.clientY);if(p)setPreview(shapeFromDrag(t,g.start,p));}
    };
    const up=(e:PointerEvent)=>{
      active.delete(e.pointerId);
      const g=gesture.current;gesture.current=null;const t=S.current.tool;if(!g||t==="pan")return;
      const p=eventLocal(e.clientX,e.clientY);if(!p)return;
      const l=S.current.cur;
      if(g.moved){
        if(t==="rect"||t==="machine"||t==="circle"){const s=shapeFromDrag(t,g.start,p);setPreview(null);commit(c=>({...c,shapes:[...c.shapes,s]}));setSel(s.id);}
        return;
      }
      const rot=baseRot();
      const near=(a:Pt)=>{const mm=mapRef.current!;const q=mm.project(toLngLat(l.origin!,a)),r=mm.getCanvasContainer().getBoundingClientRect();return Math.hypot(q.x-(e.clientX-r.left),q.y-(e.clientY-r.top))<18;};
      if(t==="area"){
        if(l.areaClosed){return;}
        if(l.area.length>=3&&near(l.area[0])){commit(c=>({...c,areaClosed:true,baseAngle:longestEdgeAngle(c.area)}));flash("Área fechada. Agora desenhe o layout dentro dela.");return;}
        commit(c=>({...c,area:[...c.area,p]}));return;
      }
      if(t==="line"){
        const d=S.current.draft;
        if(d.length>=2&&near(d[d.length-1])){const s:Shape={id:newId(),kind:"line",x:0,y:0,w:0,h:0,rot:0,pts:d,color:"#ffffff"};commit(c=>({...c,shapes:[...c.shapes,s]}));setDraft([]);setSel(s.id);return;}
        setDraft([...d,p]);return;
      }
      if(t==="dim"){
        const d=S.current.draft;
        if(d.length===1){const s:Shape={id:newId(),kind:"dim",x:0,y:0,w:0,h:0,rot:0,pts:[d[0],p],color:"#ffd400"};commit(c=>({...c,shapes:[...c.shapes,s]}));setDraft([]);setSel(s.id);}
        else setDraft([p]);
        return;
      }
      if(t==="text"){
        const txt=window.prompt("Texto:","");if(!txt)return;
        const s:Shape={id:newId(),kind:"text",x:p.x,y:p.y,w:0,h:1,rot:0,label:txt,color:"#ffffff"};commit(c=>({...c,shapes:[...c.shapes,s]}));setSel(s.id);return;
      }
      const d=DEFAULTS[t as "pallet"|"machine"|"rect"|"circle"];
      const s:Shape={id:newId(),kind:t,x:snap(p.x),y:snap(p.y),w:d.w,h:d.h,rot:t==="circle"?0:rot,color:d.color,label:d.label};
      commit(c=>({...c,shapes:[...c.shapes,s]}));setSel(s.id);
    };
    const cancel=(e:PointerEvent)=>{active.delete(e.pointerId);gesture.current=null;setPreview(null);};
    el.addEventListener("pointerdown",down);window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);
    return()=>{el.removeEventListener("pointerdown",down);window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancel);};
  },[commit,eventLocal,flash]);

  // ---------- arrastar peças / alças ----------
  const startDrag=(e:React.PointerEvent,d:Drag)=>{
    e.stopPropagation();e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    hist.current.push(cur);drag.current=d;
  };
  const onSvgMove=(e:React.PointerEvent)=>{
    const d=drag.current;if(!d)return;const p=eventLocal(e.clientX,e.clientY);if(!p)return;
    live(l=>{
      if(d.type==="vertex"){const a=[...l.area];a[d.index]=p;return {...l,area:a,baseAngle:l.areaClosed?longestEdgeAngle(a):l.baseAngle};}
      return {...l,shapes:l.shapes.map(s=>{
        if(s.id!==d.id)return s;
        if(d.type==="move"){const dx=p.x-d.start.x,dy=p.y-d.start.y;if(d.orig.pts)return {...s,pts:d.orig.pts.map(q=>({x:q.x+dx,y:q.y+dy}))};
          // desliza no esquadro da própria peça, em passos de 5 cm
          const f=toShapeFrame({x:0,y:0,rot:s.rot},{x:dx,y:dy}),v=rotate(snap(f.u),snap(f.v),s.rot);return {...s,x:d.orig.x+v.x,y:d.orig.y+v.y};}
        if(d.type==="resize"){
          if(s.kind==="circle"){const r=Math.max(0.05,snap(dist({x:s.x,y:s.y},p)));return {...s,w:r*2,h:r*2};}
          const q=toShapeFrame({x:d.fixed.x,y:d.fixed.y,rot:s.rot},p),w=clampSize(q.u),h=clampSize(q.v),c=rotate(w/2,h/2,s.rot);return {...s,w,h,x:d.fixed.x+c.x,y:d.fixed.y+c.y};}
        if(d.type==="rotate"){let r=bearingDeg({x:s.x,y:s.y},p);const b=l.baseAngle;for(let k=-4;k<=4;k++){const t=b+k*90;if(Math.abs(r-t)<4)r=t;}return {...s,rot:Math.round(r*10)/10};}
        if(d.type==="pt"&&s.pts){const pts=[...s.pts];pts[d.index]=p;return {...s,pts};}
        return s;
      })};
    });
  };
  const endDrag=()=>{if(drag.current){drag.current=null;}};

  // ---------- ações ----------
  const selShape=cur.shapes.find(s=>s.id===sel)||null;
  const upd=(patch:Partial<Shape>)=>commit(l=>({...l,shapes:l.shapes.map(s=>s.id===sel?{...s,...patch}:s)}));
  const del=()=>{commit(l=>({...l,shapes:l.shapes.filter(s=>s.id!==sel)}));setSel(null);};
  const dup=()=>{if(!selShape)return;const off=rotate(selShape.w+0.2,0,selShape.rot);const c:Shape={...selShape,id:newId(),x:selShape.x+off.x,y:selShape.y+off.y,pts:selShape.pts?.map(q=>({x:q.x+1,y:q.y}))};commit(l=>({...l,shapes:[...l.shapes,c]}));setSel(c.id);};
  const repeat=()=>{if(!selShape||selShape.pts)return;const n=Math.max(1,Math.min(200,Math.round(rep.n)));const step=rep.dir==="u"?selShape.w+rep.gap:selShape.h+rep.gap;
    const copies:Shape[]=[];for(let i=1;i<=n;i++){const o=rep.dir==="u"?rotate(step*i,0,selShape.rot):rotate(0,step*i,selShape.rot);copies.push({...selShape,id:newId(),x:selShape.x+o.x,y:selShape.y+o.y});}
    commit(l=>({...l,shapes:[...l.shapes,...copies]}));flash(`${n} cópia(s) criadas.`);};
  const newLayout=()=>{const l=emptyLayout(`Layout ${layouts.length+1}`);const m=mapRef.current;if(m){const c=m.getCenter();l.view={lng:c.lng,lat:c.lat,zoom:m.getZoom(),bearing:m.getBearing()};}setCur(l);setSel(null);setTool("area");setMenu(false);};
  const openLayout=(id:string)=>{const l=layouts.find(x=>x.id===id);if(l){setCur(l);setSel(null);setMenu(false);}};
  const removeLayout=()=>{if(!window.confirm(`Excluir "${cur.name}" deste aparelho? Não dá para desfazer.`))return;const rest=layouts.filter(l=>l.id!==cur.id);saveLayouts(rest);setLayouts(rest);setCur(rest[0]||emptyLayout());setMenu(false);};
  const resetArea=()=>{commit(l=>({...l,area:[],areaClosed:false}));setTool("area");setMenu(false);};
  const fitArea=()=>{const m=mapRef.current;if(!m||!cur.origin||cur.area.length<2)return;const b=new maplibregl.LngLatBounds();cur.area.forEach(p=>b.extend(toLngLat(cur.origin!,p)));m.fitBounds(b,{padding:60,maxZoom:21,bearing:m.getBearing()});};
  const alignView=()=>{const m=mapRef.current;if(m)m.easeTo({bearing:cur.baseAngle});};

  function download(name:string,blob:Blob){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);}
  const safeName=(cur.name||"layout").replace(/[^\w\-À-ú ]+/g,"").trim().replace(/\s+/g,"-")||"layout";
  async function exportPng(){
    const m=mapRef.current,svg=svgRef.current;if(!m||!svg)return;setSel(null);setMenu(false);
    await new Promise(r=>setTimeout(r,120));m.triggerRepaint();await new Promise(r=>m.once("render",()=>r(null)));
    try{
      const mc=m.getCanvas(),W=mc.width,H=mc.height,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d")!;
      g.drawImage(mc,0,0);
      const r=svg.getBoundingClientRect(),clone=svg.cloneNode(true) as SVGSVGElement;clone.setAttribute("width",String(r.width));clone.setAttribute("height",String(r.height));clone.setAttribute("viewBox",`0 0 ${r.width} ${r.height}`);const xml=new XMLSerializer().serializeToString(clone);const img=new Image();
      await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(xml);});
      g.drawImage(img,0,0,W,H);
      g.fillStyle="rgba(0,0,0,.55)";g.fillRect(0,H-34*devicePixelRatio,W,34*devicePixelRatio);g.fillStyle="#fff";g.font=`${13*devicePixelRatio}px system-ui`;
      g.fillText(`${cur.name} · Orion Maps${cur.areaClosed?` · área ${fmt(polygonArea(cur.area))} m²`:""}`,12*devicePixelRatio,H-12*devicePixelRatio);
      const blob:Blob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error("png")),"image/png"));
      const file=new File([blob],`${safeName}.png`,{type:"image/png"});
      if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:cur.name});return;}catch{/* cancelado: baixa */}}
      download(file.name,blob);
    }catch{flash("Não consegui gerar a imagem neste aparelho. Use o print da tela.");}
  }
  const exportJson=()=>{download(`${safeName}.orion-layout.json`,new Blob([JSON.stringify(cur,null,1)],{type:"application/json"}));setMenu(false);};
  async function importFile(f:File){
    setMenu(false);
    try{
      const name=f.name.toLowerCase();
      if(name.endsWith(".json")){const l=JSON.parse(await f.text()) as SiteLayout;if(!Array.isArray(l.shapes)||!Array.isArray(l.area))throw Error();const n={...l,id:newId(),updatedAt:Date.now()};setCur(n);flash("Layout importado.");return;}
      let kml="";
      if(name.endsWith(".kmz")){const z=unzipSync(new Uint8Array(await f.arrayBuffer()));const k=Object.keys(z).find(k=>k.toLowerCase().endsWith(".kml"));if(!k)throw Error();kml=strFromU8(z[k]);}
      else kml=await f.text();
      const pts=parseKmlPolygon(kml);if(!pts)throw Error("sem polígono");
      const o={lng:pts[0][0],lat:pts[0][1]};
      const area=pts.map(([lng,lat])=>fromLngLat(o,lng,lat));
      commit(l=>{const shapes=l.origin?l.shapes.map(s=>{const shift=fromLngLat(o,...toLngLat(l.origin!,{x:0,y:0}));return s.pts?{...s,pts:s.pts.map(q=>({x:q.x+shift.x,y:q.y+shift.y}))}:{...s,x:s.x+shift.x,y:s.y+shift.y};}):l.shapes;return {...l,origin:o,area,areaClosed:true,baseAngle:longestEdgeAngle(area),shapes};});
      setTimeout(()=>{const m=mapRef.current;if(!m)return;const b=new maplibregl.LngLatBounds();pts.forEach(p=>b.extend(p));m.fitBounds(b,{padding:60,maxZoom:21});},50);
      flash(`Área importada: ${fmt(polygonArea(area))} m².`);
    }catch{flash("Arquivo não reconhecido. Use KML/KMZ com um polígono, ou um layout .json do Orion.");}
  }

  // ---------- desenho SVG ----------
  const P=(p:Pt)=>proj(p).join(",");
  const screenAngle=(a:Pt,b:Pt)=>{const[x1,y1]=proj(a),[x2,y2]=proj(b);let ang=Math.atan2(y2-y1,x2-x1)*180/Math.PI;if(ang>90)ang-=180;if(ang<=-90)ang+=180;return ang;};
  const label=(x:number,y:number,ang:number,lines:string[],size:number,fill="#fff",key?:string)=>
    <text key={key} x={x} y={y} transform={`rotate(${ang} ${x} ${y})`} fontSize={size} fill={fill} className="lo-txt">{lines.map((t,i)=><tspan key={i} x={x} dy={i===0?-(lines.length-1)*size*0.55+size*0.35:size*1.1}>{t}</tspan>)}</text>;

  function renderShape(s:Shape,isPreview=false){
    const selected=s.id===sel&&!isPreview;
    // eslint-disable-next-line react-hooks/refs -- manipulador de evento, não roda na renderização
    const common={onPointerDown:(e:React.PointerEvent)=>{if(tool!=="pan")return;setSel(s.id);startDrag(e,{type:"move",id:s.id,start:eventLocal(e.clientX,e.clientY)!,orig:s});},className:`lo-shape ${selected?"is-sel":""} ${tool==="pan"?"is-hit":""}`};
    if(s.kind==="line"&&s.pts){return <g key={s.id}><polyline points={s.pts.map(P).join(" ")} stroke={s.color} strokeWidth={Math.max(2,pxPerM*0.1)} fill="none" {...common} strokeLinecap="round" strokeLinejoin="round"/>
      {s.pts.length>=2&&pxPerM>6&&s.pts.slice(1).map((q,i)=>{const a=s.pts![i],[x1,y1]=proj(a),[x2,y2]=proj(q);return label((x1+x2)/2,(y1+y2)/2-8,screenAngle(a,q),[`${fmt(dist(a,q))} m`],11,"#fff",`l${i}`);})}</g>;}
    if(s.kind==="dim"&&s.pts&&s.pts.length===2){const[a,b]=s.pts,[x1,y1]=proj(a),[x2,y2]=proj(b),L=Math.hypot(x2-x1,y2-y1)||1,nx=-(y2-y1)/L*7,ny=(x2-x1)/L*7;
      return <g key={s.id}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={s.color} strokeWidth={2} {...common}/><line x1={x1-nx} y1={y1-ny} x2={x1+nx} y2={y1+ny} stroke={s.color} strokeWidth={2}/><line x1={x2-nx} y1={y2-ny} x2={x2+nx} y2={y2+ny} stroke={s.color} strokeWidth={2}/>
        {label((x1+x2)/2+nx*1.6,(y1+y2)/2+ny*1.6,screenAngle(a,b),[`${fmt(dist(a,b))} m`],12,s.color)}</g>;}
    if(s.kind==="text"){const[x,y]=proj({x:s.x,y:s.y});const size=Math.max(10,Math.min(40,pxPerM*s.h));return <g key={s.id}><rect x={x-6} y={y-size*0.7} width={Math.max(20,(s.label||"").length*size*0.6)+12} height={size*1.3} fill="transparent" {...common}/><text x={x} y={y} fontSize={size} fill={s.color} className="lo-txt lo-left" pointerEvents="none">{s.label}</text></g>;}
    if(s.kind==="circle"){const[x,y]=proj({x:s.x,y:s.y}),r=s.w/2*pxPerM;return <g key={s.id}><circle cx={x} cy={y} r={Math.max(2,r)} fill={s.color} fillOpacity={0.55} stroke={s.color} strokeWidth={2} {...common}/>{r>18&&label(x,y,0,[s.label||"",`Ø ${fmt(s.w)} m`].filter(Boolean),11)}</g>;}
    const c=rectCorners(s),pts=c.map(P).join(" "),[cx,cy]=proj({x:s.x,y:s.y});
    const longIsV=s.h>=s.w,axA=longIsV?{x:s.x+rotate(0,-1,s.rot).x,y:s.y+rotate(0,-1,s.rot).y}:{x:s.x+rotate(-1,0,s.rot).x,y:s.y+rotate(-1,0,s.rot).y};
    const ang=screenAngle(axA,{x:s.x,y:s.y});const shortPx=Math.min(s.w,s.h)*pxPerM,longPx=Math.max(s.w,s.h)*pxPerM;
    const fs=Math.max(8,Math.min(14,shortPx*0.32));
    const slats=s.kind==="pallet"&&shortPx>14?[-1/3,0,1/3].map((k,i)=>{const a=rotate(k*s.w,-s.h/2,s.rot),b=rotate(k*s.w,s.h/2,s.rot);return <line key={i} x1={proj({x:s.x+a.x,y:s.y+a.y})[0]} y1={proj({x:s.x+a.x,y:s.y+a.y})[1]} x2={proj({x:s.x+b.x,y:s.y+b.y})[0]} y2={proj({x:s.x+b.x,y:s.y+b.y})[1]} stroke="rgba(0,0,0,.35)" strokeWidth={1} pointerEvents="none"/>;}):null;
    const text=s.kind==="pallet"?(s.label?[s.label]:[]):[s.label||"",`${fmt(s.w)} × ${fmt(s.h)} m`].filter(Boolean);
    return <g key={s.id} opacity={isPreview?0.7:1}><polygon points={pts} fill={s.color} fillOpacity={s.kind==="rect"?0.45:0.85} stroke={s.kind==="pallet"?"#7a1f17":"rgba(0,0,0,.6)"} strokeWidth={1.5} {...common}/>{slats}
      {shortPx>16&&longPx>40&&text.length>0&&label(cx,cy,ang,text,fs)}</g>;
  }

  function handles(){
    const s=selShape;if(!s||tool!=="pan")return null;
    const H=(p:Pt,d:Drag,cls="",k="h")=>{const[x,y]=proj(p);return <circle key={k} cx={x} cy={y} r={11} className={`lo-handle ${cls}`} onPointerDown={e=>startDrag(e,d)}/>;};
    if(s.pts)return s.pts.map((q,i)=>H(q,{type:"pt",id:s.id,index:i},"",`p${i}`));
    if(s.kind==="text")return null;
    if(s.kind==="circle")return H({x:s.x+s.w/2,y:s.y},{type:"resize",id:s.id,fixed:{x:s.x,y:s.y}});
    const c=rectCorners(s);const top=rotate(0,s.h/2+Math.max(1.2,30/pxPerM),s.rot);
    const[tx,ty]=proj({x:s.x+top.x,y:s.y+top.y}),[mx,my]=proj({x:s.x+rotate(0,s.h/2,s.rot).x,y:s.y+rotate(0,s.h/2,s.rot).y});
    return <>
      <line x1={mx} y1={my} x2={tx} y2={ty} stroke="#fff" strokeWidth={1.5} strokeDasharray="3 3"/>
      {H({x:s.x+top.x,y:s.y+top.y},{type:"rotate",id:s.id},"is-rot","rot")}
      {H(c[1],{type:"resize",id:s.id,fixed:c[3]},"is-size","size")}
    </>;
  }

  const area=cur.area,aClosed=cur.areaClosed&&area.length>=3;
  const areaInfo=aClosed?`${fmt(polygonArea(area))} m² · perímetro ${fmt(perimeter(area))} m`:area.length?`${area.length} ponto(s) · ${fmt(perimeter(area,false))} m`:"";

  return <div className="lo-root">
    <div ref={box} className={`lo-map ${tool!=="pan"?"is-drawing":""}`}/>
    <svg ref={svgRef} className="lo-svg" xmlns="http://www.w3.org/2000/svg" onPointerMove={onSvgMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <style>{`.lo-txt{font-family:system-ui,-apple-system,sans-serif;font-weight:700;text-anchor:middle;paint-order:stroke;stroke:rgba(0,0,0,.65);stroke-width:3px;pointer-events:none}.lo-left{text-anchor:start}`}</style>
      {origin&&area.length>0&&<g>
        {aClosed?<polygon points={area.map(P).join(" ")} fill="rgba(255,196,0,.12)" stroke="#ffc400" strokeWidth={3} pointerEvents="none"/>:<polyline points={area.map(P).join(" ")} fill="none" stroke="#ffc400" strokeWidth={3} pointerEvents="none"/>}
        {area.map((a,i)=>{if(!aClosed&&i===area.length-1)return null;const b=area[(i+1)%area.length],[x1,y1]=proj(a),[x2,y2]=proj(b);if(Math.hypot(x2-x1,y2-y1)<50)return null;return label((x1+x2)/2,(y1+y2)/2-9,screenAngle(a,b),[`${fmt(dist(a,b))} m`],12,"#ffd84d",`e${i}`);})}
      </g>}
      {origin&&cur.shapes.map(s=>renderShape(s))}
      {origin&&preview&&renderShape(preview,true)}
      {origin&&draft.length>0&&<g pointerEvents="none"><polyline points={draft.map(P).join(" ")} fill="none" stroke={tool==="dim"?"#ffd400":"#fff"} strokeWidth={2} strokeDasharray="6 4"/>{draft.map((q,i)=>{const[x,y]=proj(q);return <circle key={i} cx={x} cy={y} r={5} fill="#fff"/>;})}</g>}
      {origin&&handles()}
      {origin&&area.map((a,i)=>{const[x,y]=proj(a);const editable=tool==="area";return <circle key={"v"+i} cx={x} cy={y} r={editable?11:5} fill={i===0&&!aClosed?"#ff7a00":"#fff"} stroke="#ffc400" strokeWidth={3} className={editable&&aClosed?"lo-handle-v":""} pointerEvents={editable&&aClosed?"all":"none"} onPointerDown={e=>editable&&aClosed&&startDrag(e,{type:"vertex",index:i})}/>;})}
    </svg>

    <header className="lo-top">
      <Link href="/" className="lo-btn" aria-label="Voltar ao início">←</Link>
      <input className="lo-name" value={cur.name} onChange={e=>live(l=>({...l,name:e.target.value}))} aria-label="Nome do layout"/>
      <button className="lo-btn" onClick={undo} aria-label="Desfazer">↶</button>
      <button className="lo-btn" onClick={()=>setMenu(true)} aria-label="Menu">☰</button>
    </header>
    {(areaInfo||msg)&&<div className="lo-chip">{msg||<>⬠ {areaInfo}</>}</div>}
    {!selShape&&<div className="lo-hint">{HINT[tool]}</div>}
    {tool==="line"&&draft.length>=2&&<button className="lo-done" onClick={()=>{const s:Shape={id:newId(),kind:"line",x:0,y:0,w:0,h:0,rot:0,pts:draft,color:"#ffffff"};commit(c=>({...c,shapes:[...c.shapes,s]}));setDraft([]);}}>Concluir linha</button>}
    {tool==="area"&&!aClosed&&area.length>=3&&<button className="lo-done" onClick={()=>commit(c=>({...c,areaClosed:true,baseAngle:longestEdgeAngle(c.area)}))}>Fechar área</button>}

    {selShape&&tool==="pan"&&<section className="lo-sheet" aria-label="Propriedades da peça">
      <div className="lo-sheet-row">
        {selShape.kind!=="dim"&&selShape.kind!=="line"?<label className="lo-f">{TOOLS.find(t=>t.id===selShape.kind)?.label} · nome<input value={selShape.label||""} onChange={e=>upd({label:e.target.value})} placeholder="ex.: 1805"/></label>:<strong>{TOOLS.find(t=>t.id===selShape.kind)?.label}</strong>}
        <button onClick={()=>setSel(null)} className="lo-x" aria-label="Fechar">✕</button>
      </div>
      {["rect","machine","pallet"].includes(selShape.kind)&&<div className="lo-grid">
        <label className="lo-f">Largura (m)<input type="number" inputMode="decimal" step="0.05" value={selShape.w} onChange={e=>upd({w:Math.max(0.01,Number(e.target.value)||0)})}/></label>
        <label className="lo-f">Comprim. (m)<input type="number" inputMode="decimal" step="0.05" value={selShape.h} onChange={e=>upd({h:Math.max(0.01,Number(e.target.value)||0)})}/></label>
        <label className="lo-f">Giro (°)<input type="number" inputMode="decimal" step="1" value={selShape.rot} onChange={e=>upd({rot:Number(e.target.value)||0})}/></label>
      </div>}
      {selShape.kind==="circle"&&<label className="lo-f">Diâmetro (m)<input type="number" inputMode="decimal" step="0.05" value={selShape.w} onChange={e=>{const v=Math.max(0.01,Number(e.target.value)||0);upd({w:v,h:v});}}/></label>}
      {selShape.kind==="text"&&<label className="lo-f">Tamanho (m)<input type="number" inputMode="decimal" step="0.1" value={selShape.h} onChange={e=>upd({h:Math.max(0.1,Number(e.target.value)||0)})}/></label>}
      {selShape.pts&&<p className="lo-note">{selShape.kind==="dim"?"Cota":"Comprimento"}: {fmt(perimeter(selShape.pts,false))} m · arraste as bolinhas para ajustar.</p>}
      <div className="lo-colors">{COLORS.map(c=><button key={c} style={{background:c}} className={selShape.color===c?"on":""} onClick={()=>upd({color:c})} aria-label={`Cor ${c}`}/>)}</div>
      <div className="lo-actions">
        {!selShape.pts&&selShape.kind!=="circle"&&selShape.kind!=="text"&&<button onClick={()=>upd({rot:(selShape.rot+90)%360})}>⟳ 90°</button>}
        {!selShape.pts&&selShape.kind!=="circle"&&selShape.kind!=="text"&&<button onClick={()=>upd({rot:cur.baseAngle})}>Esquadrar</button>}
        <button onClick={dup}>Duplicar</button>
        <button className="danger" onClick={del}>Excluir</button>
      </div>
      {!selShape.pts&&selShape.kind!=="text"&&<div className="lo-repeat">
        <span>Repetir</span>
        <input type="number" inputMode="numeric" min={1} value={rep.n} onChange={e=>setRep(r=>({...r,n:Number(e.target.value)}))} aria-label="Quantidade de cópias"/>
        <span>× vão</span>
        <input type="number" inputMode="decimal" step="0.05" value={rep.gap} onChange={e=>setRep(r=>({...r,gap:Number(e.target.value)}))} aria-label="Vão entre cópias em metros"/>
        <span>m</span>
        <select value={rep.dir} onChange={e=>setRep(r=>({...r,dir:e.target.value as "u"|"v"}))} aria-label="Direção"><option value="u">ao lado</option><option value="v">em fila</option></select>
        <button onClick={repeat}>OK</button>
      </div>}
    </section>}

    <nav className="lo-tools" aria-label="Ferramentas">
      {TOOLS.map(t=><button key={t.id} className={tool===t.id?"on":""} onClick={()=>{setTool(t.id);if(t.id!=="pan")setSel(null);}}><span>{t.icon}</span>{t.label}</button>)}
    </nav>

    {menu&&<div className="lo-menu-bg" onClick={()=>setMenu(false)}><aside className="lo-menu" onClick={e=>e.stopPropagation()}>
      <div className="lo-sheet-row"><strong>Layout</strong><button className="lo-x" onClick={()=>setMenu(false)} aria-label="Fechar">✕</button></div>
      <p className="lo-note">Salvo neste aparelho. Para levar a outro aparelho, exporte o arquivo .json e importe lá.</p>
      <div className="lo-actions">
        <button onClick={newLayout}>＋ Novo</button>
        <button onClick={()=>void exportPng()}>Imagem PNG</button>
        <button onClick={exportJson}>Exportar .json</button>
        <label className="lo-filebtn">Importar KML / .json<input type="file" accept=".kml,.kmz,.json,application/json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value="";}}/></label>
      </div>
      <h3>Área</h3>
      <div className="lo-actions">
        <button onClick={()=>{fitArea();setMenu(false);}} disabled={area.length<2}>Ver área inteira</button>
        <button onClick={()=>{alignView();setMenu(false);}} disabled={!aClosed}>Girar mapa no esquadro</button>
        <button onClick={resetArea}>Refazer área</button>
      </div>
      <label className="lo-check"><input type="checkbox" checked={align} onChange={e=>setAlign(e.target.checked)}/> Peças novas no esquadro da área ({fmt(cur.baseAngle,1)}°)</label>
      <h3>Mapa</h3>
      <div className="lo-actions">
        <button className={basemap==="sat"?"on":""} onClick={()=>setBasemap("sat")}>Satélite</button>
        <button className={basemap==="street"?"on":""} onClick={()=>setBasemap("street")}>Ruas</button>
      </div>
      <GoogleMapsImport onApply={p=>{mapRef.current?.jumpTo({center:[p.lon,p.lat],zoom:Math.max(18,p.zoom)});setMenu(false);}}/>
      <h3>Meus layouts</h3>
      <ul className="lo-list">{[...layouts].sort((a,b)=>b.updatedAt-a.updatedAt).map(l=><li key={l.id}><button className={l.id===cur.id?"on":""} onClick={()=>openLayout(l.id)}><b>{l.name}</b><small>{l.shapes.length} peça(s){l.areaClosed?` · ${fmt(polygonArea(l.area))} m²`:""}</small></button></li>)}</ul>
      <div className="lo-actions"><button className="danger" onClick={removeLayout}>Excluir este layout</button></div>
    </aside></div>}
  </div>;
}

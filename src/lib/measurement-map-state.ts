import type {Map} from "maplibre-gl";
const active=new WeakSet<Map>();
export function isMeasuringMap(map:Map){return active.has(map);}
export function setMeasuringMap(map:Map,on:boolean){if(on)active.add(map);else active.delete(map);}

type ToolInteraction={users:number;canvas:HTMLCanvasElement;cursor:string;doubleClickZoom:boolean};
const interactions=new WeakMap<Map,ToolInteraction>();

// Drawing and terrain inspection may overlap during React effect handoff.
// Restore navigation only when the last active tool releases its interaction.
export function lockMapToolInteraction(map:Map){
 let state=interactions.get(map);
 if(!state){
  const canvas=map.getCanvas();
  state={users:0,canvas,cursor:canvas.style.cursor,doubleClickZoom:map.doubleClickZoom.isEnabled()};
  interactions.set(map,state);
 }
 const current=state;
 current.users+=1;
 map.doubleClickZoom.disable();
 current.canvas.style.cursor="crosshair";
 let released=false;
 return ()=>{
  if(released)return;
  released=true;
  current.users-=1;
  if(current.users>0)return;
  interactions.delete(map);
  current.canvas.style.cursor=current.cursor;
  if(current.doubleClickZoom)map.doubleClickZoom.enable();
 };
}

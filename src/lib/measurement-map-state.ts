import type {Map} from "maplibre-gl";
const active=new WeakSet<Map>();
export function isMeasuringMap(map:Map){return active.has(map);}
export function setMeasuringMap(map:Map,on:boolean){if(on)active.add(map);else active.delete(map);}

"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import * as maplibregl from "maplibre-gl";
import type {GeoJSONSource,ImageSource} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {ProcessingResult} from "@/lib/supabase/processing-results";

type Bounds={west:number;south:number;east:number;north:number};
type Props={results:ProcessingResult[]};

const rasterKinds=["orthophoto","hillshade","hypsometry","slope"] as const;
type RasterKind=(typeof rasterKinds)[number];

function readBounds(results:ProcessingResult[]):Bounds|null{
  for(const item of results){
    const raw=item.metadata?.bounds_wgs84 as Partial<Bounds>|undefined;
    if(raw&&[raw.west,raw.south,raw.east,raw.north].every(v=>typeof v==="number"&&Number.isFinite(v))){
      return raw as Bounds;
    }
  }
  return null;
}

export default function ResultsMap({results}:Props){
  const el=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null);
  const [ready,setReady]=useState(false);
  const [visible,setVisible]=useState<Record<string,boolean>>({orthophoto:true,contours:true,hillshade:false,hypsometry:false,slope:false});
  const bounds=useMemo(()=>readBounds(results),[results]);

  useEffect(()=>{
    if(!el.current||!bounds)return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const m=new maplibregl.Map({
      container:el.current,
      style:{
        version:8,
        sources:{
          basemap:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,maxzoom:19,attribution:"© OpenStreetMap contributors"},
        },
        layers:[
          {id:"background",type:"background",paint:{"background-color":"#dfe8dc"}},
          {id:"basemap",type:"raster",source:"basemap"},
        ],
      },
      center:[(bounds.west+bounds.east)/2,(bounds.south+bounds.north)/2],
      zoom:17,
      attributionControl:false,
      renderWorldCopies:false,
    });
    map.current=m;
    m.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-left");
    m.addControl(new maplibregl.ScaleControl({unit:"metric"}),"bottom-left");
    m.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");
    m.on("load",()=>{
      const corners:[[number,number],[number,number],[number,number],[number,number]]=[
        [bounds.west,bounds.north],[bounds.east,bounds.north],[bounds.east,bounds.south],[bounds.west,bounds.south],
      ];
      for(const kind of rasterKinds){
        const item=results.find(r=>r.kind===kind&&r.preview_url);
        if(!item?.preview_url)continue;
        m.addSource(`result-${kind}`,{type:"image",url:item.preview_url,coordinates:corners});
        m.addLayer({
          id:`result-${kind}`,
          type:"raster",
          source:`result-${kind}`,
          paint:{"raster-opacity":kind==="orthophoto"?0.92:0.72},
          layout:{visibility:visible[kind]?"visible":"none"},
        });
      }
      const contours=results.find(r=>r.kind==="contours"&&r.preview_url);
      if(contours?.preview_url){
        fetch(contours.preview_url).then(r=>r.json()).then(data=>{
          if(!map.current||!map.current.isStyleLoaded())return;
          map.current.addSource("result-contours",{type:"geojson",data});
          map.current.addLayer({
            id:"result-contours",
            type:"line",
            source:"result-contours",
            paint:{"line-color":"#8a3f17","line-width":1.25,"line-opacity":0.88},
            layout:{visibility:visible.contours?"visible":"none"},
          });
        }).catch(()=>{});
      }
      m.fitBounds([[bounds.west,bounds.south],[bounds.east,bounds.north]],{padding:50,maxZoom:19});
      setReady(true);
    });
    return()=>{m.remove();map.current=null;};
  // visibility is intentionally handled in a separate effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[results,bounds?.west,bounds?.south,bounds?.east,bounds?.north]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    for(const key of [...rasterKinds,"contours"]){
      const id=`result-${key}`;
      if(m.getLayer(id))m.setLayoutProperty(id,"visibility",visible[key]?"visible":"none");
    }
  },[visible,ready]);

  if(!bounds)return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Os resultados existem, mas ainda não há limites geográficos suficientes para abrir o mapa.</div>;

  const controls=[
    ["orthophoto","Ortofoto"],
    ["contours","Curvas 0,50 m"],
    ["hillshade","Relevo sombreado"],
    ["hypsometry","Hipsometria"],
    ["slope","Declividade"],
  ] as const;

  return <div>
    <div className="mb-3 flex flex-wrap gap-2">
      {controls.map(([key,label])=><button key={key} type="button" onClick={()=>setVisible(v=>({...v,[key]:!v[key]}))} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${visible[key]?"border-emerald-700 bg-emerald-700 text-white":"border-emerald-200 bg-white text-emerald-900"}`}>{label}</button>)}
    </div>
    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-slate-100">
      <div ref={el} className="h-[560px] w-full min-h-[420px]" aria-label="Mapa dos resultados do processamento"/>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-500">Visualização web em WGS84. Os produtos técnicos originais continuam disponíveis para download no CRS registrado em cada arquivo.</p>
  </div>;
}

"use client";

import type {ReactNode} from "react";
import type {ProcessingResult} from "@/lib/supabase/processing-results";
import GeoTiffReportImage from "./geotiff-report-image";

type Coord=[number,number];
type Props={results:ProcessingResult[];planBoundary?:{name:string;points:Coord[]}|null};

function Perspective({title,subtitle,children}:{title:string;subtitle?:string;children:ReactNode}){
  return <section className="report-perspective mt-8 break-before-page">
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Perspectiva técnica</p>
      <h2 className="mt-1 text-xl font-semibold">{title}</h2>
      {subtitle&&<p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
    </div>
    {children}
  </section>;
}

export default function ReportPerspectives({results,planBoundary}:Props){
  const ortho=results.find(r=>r.kind==="orthophoto"&&r.preview_url);
  const hill=results.find(r=>r.kind==="hillshade"&&r.preview_url);
  const hypso=results.find(r=>r.kind==="hypsometry"&&r.preview_url);
  const slope=results.find(r=>r.kind==="slope"&&r.preview_url);
  const dtm=results.find(r=>r.kind==="dtm"&&r.download_url);
  const dsm=results.find(r=>r.kind==="dsm"&&r.download_url);
  const cloud=results.find(r=>r.kind==="point_cloud");
  const contours=results.find(r=>r.kind==="contours");
  const cloudSize=cloud?.size_bytes?((cloud.size_bytes/1024/1024).toFixed(1)+" MB"):"—";

  return <>
    {ortho?.preview_url&&<Perspective title="Ortofoto" subtitle="Mosaico ortorretificado do levantamento.">
      <img src={ortho.preview_url} alt="Ortofoto do levantamento" className="w-full rounded-xl border border-slate-200"/>
    </Perspective>}

    {ortho?.preview_url&&<Perspective title="Plano de voo" subtitle={planBoundary?"Plano de voo associado: "+planBoundary.name+". O contorno permanece disponível no mapa interativo do aplicativo.":"Plano compatível não localizado."}>
      <img src={ortho.preview_url} alt="Base da ortofoto para plano de voo" className="w-full rounded-xl border border-slate-200"/>
    </Perspective>}

    {contours&&<Perspective title="Curvas de nível · 0,50 m" subtitle="Produto vetorial com linhas de mesma cota altimétrica. A visualização interativa permanece disponível no mapa do aplicativo.">
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 text-sm text-orange-900">
        Curvas de nível geradas com intervalo vertical de 0,50 m.
      </div>
    </Perspective>}

    {hill?.preview_url&&<Perspective title="Relevo sombreado" subtitle="Representação de relevo por iluminação simulada.">
      <img src={hill.preview_url} alt="Relevo sombreado" className="w-full rounded-xl border border-slate-200"/>
    </Perspective>}

    {hypso?.preview_url&&<Perspective title="Hipsometria" subtitle="Classes de altitude representadas por cores.">
      <img src={hypso.preview_url} alt="Mapa hipsométrico" className="w-full rounded-xl border border-slate-200"/>
    </Perspective>}

    {slope?.preview_url&&<Perspective title="Declividade" subtitle="Representação da inclinação do terreno derivada do modelo digital.">
      <img src={slope.preview_url} alt="Mapa de declividade" className="w-full rounded-xl border border-slate-200"/>
    </Perspective>}

    {dtm?.download_url&&<Perspective title="DTM · Modelo Digital do Terreno" subtitle="Superfície estimada do terreno.">
      <GeoTiffReportImage url={dtm.download_url} kind="dtm"/>
    </Perspective>}

    {dsm?.download_url&&<Perspective title="DSM · Modelo Digital de Superfície" subtitle="Superfície observada incluindo vegetação, telhados e outros objetos.">
      <GeoTiffReportImage url={dsm.download_url} kind="dsm"/>
    </Perspective>}

    {cloud&&<Perspective title="Nuvem de pontos" subtitle="Produto tridimensional do levantamento, armazenado em formato LAZ.">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><span className="text-xs text-slate-500">Produto</span><strong className="mt-1 block">Nuvem de pontos</strong></div>
          <div><span className="text-xs text-slate-500">Formato</span><strong className="mt-1 block">LAZ</strong></div>
          <div><span className="text-xs text-slate-500">Tamanho</span><strong className="mt-1 block">{cloudSize}</strong></div>
        </div>
      </div>
    </Perspective>}
  </>;
}

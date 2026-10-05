"use client";

import type {ReactNode} from "react";
import type {ProcessingResult} from "@/lib/supabase/processing-results";

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

function ProductImage({src,alt}:{src:string;alt:string}){
  return <img src={src} alt={alt} className="w-full rounded-xl border border-slate-200" crossOrigin="anonymous"/>;
}

export default function ReportPerspectives({results,planBoundary}:Props){
  const ortho=results.find(r=>r.kind==="orthophoto"&&r.preview_url);
  const hill=results.find(r=>r.kind==="hillshade"&&r.preview_url);
  const hypso=results.find(r=>r.kind==="hypsometry"&&r.preview_url);
  const slope=results.find(r=>r.kind==="slope"&&r.preview_url);
  const dtm=results.find(r=>r.kind==="dtm");
  const dsm=results.find(r=>r.kind==="dsm");
  const cloud=results.find(r=>r.kind==="point_cloud");
  const contours=results.find(r=>r.kind==="contours");
  const cloudSize=cloud?.size_bytes?((cloud.size_bytes/1024/1024).toFixed(1)+" MB"):"—";

  return <>
    {ortho?.preview_url&&<Perspective title="Ortofoto" subtitle="Mosaico ortorretificado do levantamento.">
      <ProductImage src={ortho.preview_url} alt="Ortofoto do levantamento"/>
    </Perspective>}

    {ortho?.preview_url&&<Perspective title="Plano de voo" subtitle={planBoundary?"Plano associado: "+planBoundary.name+". Área e perímetro são calculados pelo contorno salvo.":"Plano compatível não localizado."}>
      <ProductImage src={ortho.preview_url} alt="Ortofoto de referência do plano"/>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Contorno do plano disponível na visualização interativa do projeto.</p>
    </Perspective>}

    {contours&&<Perspective title="Curvas de nível · 0,50 m" subtitle="Equidistância vertical de 0,50 m.">
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-900">Produto vetorial GeoJSON gerado. Maior proximidade entre curvas indica maior variação do relevo.</div>
    </Perspective>}

    {hill?.preview_url&&<Perspective title="Relevo sombreado" subtitle="Representação do relevo por iluminação simulada.">
      <ProductImage src={hill.preview_url} alt="Relevo sombreado"/>
    </Perspective>}

    {hypso?.preview_url&&<Perspective title="Hipsometria" subtitle="Representação das variações de altitude por cores.">
      <ProductImage src={hypso.preview_url} alt="Mapa hipsométrico"/>
    </Perspective>}

    {slope?.preview_url&&<Perspective title="Declividade" subtitle="Representação da variação de inclinação da superfície.">
      <ProductImage src={slope.preview_url} alt="Mapa de declividade"/>
    </Perspective>}

    {dtm&&<Perspective title="DTM · Modelo Digital do Terreno" subtitle="Modelo raster do terreno estimado.">
      {hypso?.preview_url?<ProductImage src={hypso.preview_url} alt="Representação altimétrica associada ao DTM"/>:<div className="rounded-xl bg-slate-50 p-5 text-sm">Arquivo GeoTIFF disponível nos produtos técnicos.</div>}
      <p className="mt-3 text-xs leading-5 text-slate-600">Em áreas com vegetação, a superfície do terreno é estimada pelo processo de classificação dos pontos.</p>
    </Perspective>}

    {dsm&&<Perspective title="DSM · Modelo Digital de Superfície" subtitle="Modelo da superfície observada, incluindo elementos acima do terreno.">
      {hill?.preview_url?<ProductImage src={hill.preview_url} alt="Representação da superfície associada ao DSM"/>:<div className="rounded-xl bg-slate-50 p-5 text-sm">Arquivo GeoTIFF disponível nos produtos técnicos.</div>}
    </Perspective>}

    {cloud&&<Perspective title="Nuvem de pontos" subtitle="Produto tridimensional do levantamento.">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><span className="text-xs text-slate-500">Produto</span><strong className="mt-1 block">Nuvem de pontos</strong></div>
          <div><span className="text-xs text-slate-500">Formato</span><strong className="mt-1 block">LAZ</strong></div>
          <div><span className="text-xs text-slate-500">Tamanho</span><strong className="mt-1 block">{cloudSize}</strong></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-600">A navegação 3D permanece disponível no Orion Maps. O arquivo LAZ pode ser baixado para uso técnico.</p>
      </div>
    </Perspective>}
  </>;
}

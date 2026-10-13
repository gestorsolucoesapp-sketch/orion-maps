/* eslint-disable @next/next/no-img-element -- The private orthophoto preview uses a signed URL. */
import type {SavedMeasurement} from "@/components/measurement/actions";
import {compareSavedAreas,comparisonFrame,pointPercent,validGeoBounds,type ComparisonSide,type GeoBounds} from "@/lib/measurement-comparison";
import type {ProcessingResult} from "@/lib/supabase/processing-results";
import {orthophotoPreviewUrl} from "@/lib/orthophoto-preview-url";

type Props={surveyId:string;flightDate:string|null;results:ProcessingResult[];measurements:SavedMeasurement[];beforeId?:string;afterId?:string;error?:string};
const area=(value:number)=>value.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const hectares=(value:number)=>value.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:4});
const percent=(value:number)=>value.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const savedAt=(value:string)=>new Date(value).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"});

function outline(side:ComparisonSide|null,frame:GeoBounds){
  if(!side)return null;
  const points=side.record.measurement.points.map(point=>pointPercent(point,frame).map(v=>v.toFixed(5)).join(",")).join(" ");
  return <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Contorno da medição ${side.record.name}`}>
    <polygon points={points} fill="#facc1533" stroke="#071a1c" strokeWidth="1.3" vectorEffect="non-scaling-stroke"/>
    <polygon points={points} fill="none" stroke="#facc15" strokeWidth="0.75" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function values(side:ComparisonSide|null){
  if(!side)return <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Contorno ainda não medido ou não selecionado.</p>;
  return <div className="mt-3 space-y-1 text-sm">
    <p className="font-semibold text-slate-900">{side.record.name}</p>
    {side.record.measurement.manual_adjusted&&<p className="text-xs font-semibold text-amber-800">Geometria ajustada manualmente por comprimento informado; não representa precisão nova da imagem.</p>}
    <p>Área horizontal: <strong>{area(side.area_m2)} m²</strong> · <strong>{hectares(side.area_ha)} ha</strong></p>
    <p>Perímetro: <strong>{area(side.perimeter_m)} m</strong></p>
    <p className="text-xs text-slate-500">Medição salva em {savedAt(side.record.created_at)} · ID {side.record.id.slice(0,8)}</p>
  </div>;
}

export default function ReportMeasurementComparison({surveyId,flightDate,results,measurements,beforeId,afterId,error}:Props){
  const orthophoto=results.find(item=>item.kind==="orthophoto"&&item.preview_url);
  const bounds=validGeoBounds(orthophoto?.metadata?.bounds_wgs84);
  const comparison=compareSavedAreas(measurements,surveyId,beforeId,afterId);
  const beforeOptions=measurements.filter(row=>row.survey_id===surveyId&&row.image_source==="satellite_reference"&&row.measurement.kind==="polygon");
  const afterOptions=measurements.filter(row=>row.survey_id===surveyId&&row.image_source==="orthophoto"&&row.measurement.kind==="polygon");
  const points=[...(comparison.before?.record.measurement.points||[]),...(comparison.after?.record.measurement.points||[])];
  const frame=bounds?comparisonFrame(bounds,points):null;
  const topLeft=bounds&&frame?pointPercent([bounds.west,bounds.north],frame):null;
  const bottomRight=bounds&&frame?pointPercent([bounds.east,bounds.south],frame):null;
  const preview=orthophoto?orthophotoPreviewUrl(orthophoto):null;
  const flightLabel=flightDate?flightDate.split("-").reverse().join("/"):"não informada";
  return <section className="mt-8 break-before-page" aria-label="Comparativo das medições antes e depois">
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Comparativo planimétrico</p>
    <h2 className="mt-1 text-xl font-semibold">Antes e depois da ortofoto</h2>
    <p className="mt-2 text-xs leading-5 text-slate-600">Compare dois contornos marcados separadamente no mesmo levantamento. “Antes” usa o mapa satélite de referência; “depois” usa a ortofoto. A diferença descreve a área delimitada, não uma mudança física do terreno.</p>
    {error&&<p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">Não foi possível carregar as medições salvas: {error}</p>}

    <form action="/processamento/relatorio" method="get" className="print:hidden mt-4 grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="levantamento" value={surveyId}/>
      <label className="text-xs font-semibold text-emerald-950">Antes · mapa de referência
        <select name="antes" defaultValue={comparison.before?.record.id||""} className="mt-1 block min-h-11 w-full rounded-lg border border-emerald-300 bg-white px-2 text-sm">
          <option value="">A medir / não disponível</option>{beforeOptions.map(row=><option key={row.id} value={row.id}>{row.name} · {savedAt(row.created_at)}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-emerald-950">Depois · ortofoto
        <select name="depois" defaultValue={comparison.after?.record.id||""} className="mt-1 block min-h-11 w-full rounded-lg border border-emerald-300 bg-white px-2 text-sm">
          <option value="">A medir / não disponível</option>{afterOptions.map(row=><option key={row.id} value={row.id}>{row.name} · {savedAt(row.created_at)}</option>)}
        </select>
      </label>
      <button type="submit" className="min-h-11 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white">Aplicar no PDF</button>
      <p className="sm:col-span-3 text-xs leading-5 text-emerald-950">No <a href={`/processamento/resultados?levantamento=${encodeURIComponent(surveyId)}`} className="font-bold underline">mapa de resultados</a>, use “Antes · mapa satélite” para marcar o primeiro contorno e “Medir área na ortofoto” para marcar o segundo. Salve cada polígono com a fonte efetivamente usada. Há {beforeOptions.length} medição(ões) de referência e {afterOptions.length} medição(ões) de ortofoto identificadas neste projeto.</p>
    </form>

    {!frame&&<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Sem limites geográficos válidos da ortofoto para alinhar os dois quadros. Os valores das medições continuam disponíveis abaixo.</div>}
    {frame&&<div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="break-inside-avoid rounded-xl border border-slate-200 p-3">
        <h3 className="text-sm font-semibold">Antes · mapa satélite de referência</h3>
        <div className="relative mt-2 aspect-[3/2] overflow-hidden rounded-lg border border-slate-200 bg-[#e5ebe6]" style={{backgroundImage:"linear-gradient(#cbd9d0 1px,transparent 1px),linear-gradient(90deg,#cbd9d0 1px,transparent 1px)",backgroundSize:"20% 20%"}}>
          <p className="absolute inset-x-5 top-1/2 -translate-y-1/2 rounded-lg bg-white/90 p-3 text-center text-xs text-slate-700">Imagem satélite não incorporada ao PDF. Quadro geográfico sem fotografia.</p>
          {outline(comparison.before,frame)}
          <span className="absolute right-2 top-2 rounded bg-white/85 px-2 py-1 text-[10px] font-bold">N ↑</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Referência no mapa interativo: Esri World Imagery. Imagem não incluída neste PDF; data da cena não informada. Enquadramento WGS84 comum.</p>
        {values(comparison.before)}
      </div>
      <div className="break-inside-avoid rounded-xl border border-slate-200 p-3">
        <h3 className="text-sm font-semibold">Depois · ortofoto do levantamento</h3>
        <div className="relative mt-2 aspect-[3/2] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {preview&&topLeft&&bottomRight&&<img src={preview} alt="Ortofoto georreferenciada do levantamento" className="absolute" style={{left:`${topLeft[0]}%`,top:`${topLeft[1]}%`,width:`${bottomRight[0]-topLeft[0]}%`,height:`${bottomRight[1]-topLeft[1]}%`}}/>}
          {outline(comparison.after,frame)}
          <span className="absolute right-2 top-2 rounded bg-white/85 px-2 py-1 text-[10px] font-bold">N ↑</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Fonte: ortofoto processada deste projeto. Data cadastrada do voo: {flightLabel}. Enquadramento WGS84 comum.</p>
        {values(comparison.after)}
      </div>
    </div>}

    {comparison.delta_m2!==null&&<div className="mt-4 break-inside-avoid rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <strong className="block">Diferença entre as áreas delimitadas: {comparison.delta_m2>=0?"+":""}{area(comparison.delta_m2)} m² · {comparison.delta_ha!>=0?"+":""}{hectares(comparison.delta_ha!)} ha · {comparison.delta_percent!>=0?"+":""}{percent(comparison.delta_percent!)}%</strong>
      <p className="mt-1 text-xs">Percentual calculado sobre a área “antes”. {comparison.visual_only?"O mesmo polígono foi reaplicado nas duas fontes: comparação apenas visual, com medidas iguais.":"Os contornos são distintos; a diferença pode refletir a delimitação escolhida, não alteração do terreno."}</p>
    </div>}
    {comparison.delta_m2===null&&<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">Diferença indisponível: selecione um polígono salvo para cada fonte. Nenhuma área ou porcentagem foi presumida.</p>}
    <p className="mt-3 text-[11px] leading-5 text-slate-600">A fonte usada para marcar cada contorno foi informada ao salvar a medição. Medidas horizontais no elipsoide WGS84 não são área da superfície 3D. Mais detalhe visual da ortofoto não comprova precisão centimétrica. A qualidade depende de GSD, georreferenciamento, pontos de controle e conferência independente.</p>
  </section>;
}

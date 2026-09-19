"use client";

import Link from "next/link";
import { useState } from "react";
import { calculateGsd, type CameraPlan } from "@/lib/gsd";

const example: CameraPlan = { sensorWidth: 13.2, sensorHeight: 8.8, focalLength: 8.8, imageWidth: 5472, imageHeight: 3648, height: 100, frontOverlap: 80, sideOverlap: 70, speed: 5, targetGsd: 3 };
const fields: { key: keyof CameraPlan; label: string; step: string }[] = [
  { key: "sensorWidth", label: "Largura ativa do sensor (mm)", step: "0.01" },
  { key: "sensorHeight", label: "Altura ativa do sensor (mm)", step: "0.01" },
  { key: "focalLength", label: "Distância focal real (mm)", step: "0.01" },
  { key: "imageWidth", label: "Largura da foto (pixels)", step: "1" },
  { key: "imageHeight", label: "Altura da foto (pixels)", step: "1" },
  { key: "height", label: "Altura sobre o terreno (m)", step: "0.1" },
  { key: "frontOverlap", label: "Sobreposição frontal (%)", step: "0.1" },
  { key: "sideOverlap", label: "Sobreposição lateral (%)", step: "0.1" },
  { key: "speed", label: "Velocidade (m/s)", step: "0.1" },
  { key: "targetGsd", label: "GSD desejado (cm/pixel)", step: "0.01" },
];
const format = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export default function GsdPage() {
  const [values, setValues] = useState(() => Object.fromEntries(Object.entries(example).map(([key, value]) => [key, String(value)])) as Record<keyof CameraPlan, string>);
  const plan = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])) as CameraPlan;
  let result: ReturnType<typeof calculateGsd> | undefined, error = "";
  try { result = calculateGsd(plan); } catch (e) { error = e instanceof Error ? e.message : "Confira os parâmetros."; }
  function exportPlan() {
    if (!result) return;
    const blob = new Blob([JSON.stringify({ parameters: plan, results: result, assumptions: "Nadir; terreno plano; altura da imagem alinhada ao voo. Parâmetros informados pelo usuário." }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "orion-planejamento-gsd.json"; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
    <header className="flex items-center justify-between border-b border-slate-200 pb-6 print:hidden"><Link href="/painel" className="text-xl font-bold">ORION <span className="font-normal">MAPS</span></Link><Link href="/painel" className="text-sm font-semibold text-emerald-800">← Meus levantamentos</Link></header>
    <div className="py-9"><p className="text-xs font-bold tracking-widest text-emerald-700">PLANEJAMENTO · GSD</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Veja o detalhe antes do voo.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">Calcule a resolução esperada no solo, a cobertura de cada foto e o espaçamento para a sobreposição desejada.</p></div>
    <div className="grid items-start gap-7 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Câmera e voo</h2><p className="my-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">Os valores iniciais são um exemplo editável. Preencha os dados da sua câmera e do modo de captura. Use a focal real, não a equivalente a 35 mm.</p><div className="grid gap-4 sm:grid-cols-2">{fields.map(field => <label key={field.key} className="text-sm font-semibold">{field.label}<input type="number" min={field.key.includes("Overlap") ? "0" : field.step} max={field.key.includes("Overlap") ? "99.9" : undefined} step={field.step} value={values[field.key]} onChange={e => setValues(current => ({ ...current, [field.key]: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>)}</div></section>
      <section aria-live="polite" className="space-y-5">
        {error ? <p role="alert" className="rounded-xl bg-red-50 p-5 text-red-800">{error}</p> : result && <>
          <div className="rounded-2xl bg-emerald-950 p-7 text-white"><p className="text-sm text-emerald-200">Resolução no solo</p><p className="mt-3 text-4xl font-semibold" data-testid="gsd-result">{format(result.gsdX)} × {format(result.gsdY)} <span className="text-base font-normal">cm/pixel</span></p><p className="mt-4 text-sm leading-6 text-emerald-100">Cada pixel representa aproximadamente essa dimensão do terreno. GSD não é uma medida da acurácia do levantamento.</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Geometria estimada</h2><dl className="mt-4 grid grid-cols-2 gap-5 text-sm">{[
            ["Cobertura de uma foto", `${format(result.footprintWidth)} × ${format(result.footprintHeight)} m`],
            ["Distância entre fotos", `${format(result.photoSpacing)} m`],
            ["Distância entre faixas", `${format(result.lineSpacing)} m`],
            ["Intervalo entre disparos", `${format(result.interval)} s`],
            ["Altura para o GSD desejado", `${format(result.targetHeight)} m`],
          ].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>)}</dl><p className="mt-5 text-xs leading-6 text-slate-500">Câmera apontada para baixo, terreno plano e altura da foto orientada no sentido do voo. Recorte, relevo e inclinação alteram os resultados. A altura calculada não é uma autorização de voo.</p></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><caption className="p-4 text-left font-semibold">Compare alturas com a mesma câmera</caption><thead className="bg-slate-50"><tr><th className="px-5 py-3">Altura</th><th className="px-5 py-3">GSD X × Y</th></tr></thead><tbody>{[40, 60, 80, 100, 120].map(height => { const row = calculateGsd({ ...plan, height }); return <tr key={height} className="border-t border-slate-100"><td className="px-5 py-3">{height} m</td><td className="px-5 py-3">{format(row.gsdX)} × {format(row.gsdY)} cm/pixel</td></tr>; })}</tbody></table></div>
          <div className="flex flex-wrap gap-3 print:hidden"><button onClick={exportPlan} className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white">Exportar cálculo</button><button onClick={() => window.print()} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold">Imprimir</button></div>
        </>}
      </section>
    </div>
    <footer className="py-8 text-xs leading-6 text-slate-500">Método geométrico: GSD = altura × dimensão do sensor ÷ (focal × pixels), com conversão para cm. <a href="https://support.pix4d.com/hc/en-us/articles/202557469" target="_blank" rel="noreferrer" className="underline">Referência técnica: Pix4D</a>.</footer>
  </main>;
}


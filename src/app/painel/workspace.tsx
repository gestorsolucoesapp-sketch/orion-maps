"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { Survey, SurveyImage } from "@/lib/supabase/surveys";
import { openImage, prepareImageUpload, saveSurvey } from "./survey-actions";

const input = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
export function SurveyForm({ survey }: { survey?: Survey }) {
  const [state, action, pending] = useActionState(saveSurvey, {});
  return <form action={action} className="space-y-5">
    <input type="hidden" name="id" value={survey?.id ?? ""} />
    <label className="block text-sm font-semibold">Nome do levantamento<input className={input} name="name" required minLength={2} maxLength={120} defaultValue={survey?.name} placeholder="Ex.: Área experimental — setembro" /></label>
    <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-semibold">Local<input className={input} name="location" maxLength={200} defaultValue={survey?.location} placeholder="Município ou identificação da área" /></label><label className="block text-sm font-semibold">Data do voo<input className={input} name="flight_date" type="date" defaultValue={survey?.flight_date ?? ""} /></label></div>
    <label className="block text-sm font-semibold">Drone / câmera<input className={input} name="drone" maxLength={100} defaultValue={survey?.drone} placeholder="Modelo utilizado no levantamento" /></label>
    <label className="block text-sm font-semibold">Anotações<textarea className={input} name="notes" rows={4} maxLength={3000} defaultValue={survey?.notes} placeholder="Objetivo, condições do voo e observações de campo" /></label>
    {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    <button disabled={pending} className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Salvando…" : survey ? "Salvar alterações" : "Criar levantamento"}</button>
  </form>;
}

function sizeLabel(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function originalName(name: string) { return name.replace(/^[0-9a-f-]{36}_/, ""); }
type QueueItem = { file: File; progress: number; status: "aguardando" | "enviando" | "concluído" | "erro"; error?: string };

export function ImageWorkspace({ survey, images }: { survey: Survey; images: SurveyImage[] }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const update = (index: number, patch: Partial<QueueItem>) => setQueue(items => items.map((item, i) => i === index ? { ...item, ...patch } : item));

  async function upload() {
    setBusy(true); setMessage("");
    let completed = 0;
    try {
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (item.status === "concluído") continue;
        update(i, { status: "enviando", progress: 0, error: undefined });
        try {
          const signed = await prepareImageUpload(survey.id, item.file.name, item.file.type, item.file.size);
          if (!signed.url) throw new Error(signed.error ?? "Não foi possível preparar o envio.");
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", signed.url!); xhr.timeout = 180000;
            xhr.setRequestHeader("x-upsert", "false");
            xhr.upload.onprogress = event => { if (event.lengthComputable) update(i, { progress: Math.round(event.loaded / event.total * 100) }); };
            xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Envio recusado (${xhr.status}). Verifique o limite de armazenamento.`));
            xhr.onerror = () => reject(new Error("Conexão interrompida. Confira a lista antes de reenviar."));
            xhr.ontimeout = () => reject(new Error("Envio demorou demais. Confira a lista antes de reenviar."));
            const body = new FormData(); body.append("cacheControl", "3600"); body.append("", item.file); xhr.send(body);
          });
          update(i, { status: "concluído", progress: 100 }); completed++;
        } catch (error) { update(i, { status: "erro", error: error instanceof Error ? error.message : "Falha no envio." }); }
      }
      setMessage(`${completed} foto(s) enviada(s) nesta tentativa. Confira os arquivos e os avisos abaixo.`);
    } finally { setBusy(false); router.refresh(); }
  }

  async function preview(image: SurveyImage) {
    setOpening(image.name); setMessage("");
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const result = await openImage(survey.id, image.name);
      if (!result.url) throw new Error(result.error);
      if (popup) popup.location.href = result.url;
      else setMessage("Permita abrir uma nova aba para visualizar a foto.");
    } catch (error) { popup?.close(); setMessage(error instanceof Error ? error.message : "Não foi possível abrir."); }
    finally { setOpening(null); }
  }

  function exportInventory() {
    const file = new Blob([JSON.stringify({ survey, exported_at: new Date().toISOString(), processing: "not_connected", images: images.map(image => ({ name: originalName(image.name), storage_name: image.name, size_bytes: image.metadata?.size, uploaded_at: image.created_at })) }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = `levantamento-${survey.id}.json`; a.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-6">
    <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-6 print:hidden">
      <h3 className="font-semibold">Adicionar imagens do voo</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">JPG e PNG originais, até 50 MB por foto e 200 fotos por lote. O envio vai diretamente ao armazenamento privado. Mantenha esta página aberta até concluir.</p>
      <input aria-label="Selecionar fotos do levantamento" className="mt-4 block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:font-semibold" type="file" accept="image/jpeg,image/png" multiple disabled={busy} onChange={event => {
        const files = Array.from(event.target.files ?? []);
        if (files.length > 200) { setMessage("Selecione no máximo 200 fotos por lote."); event.target.value = ""; return; }
        setQueue(files.map(file => ({ file, progress: 0, status: "aguardando" }))); setMessage("");
      }} />
      {queue.length > 0 && <><p className="mt-3 text-sm">{queue.length} fotos · {sizeLabel(queue.reduce((sum, item) => sum + item.file.size, 0))}</p><button disabled={busy || queue.every(item => item.status === "concluído")} onClick={upload} className="mt-4 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Enviando fotos…" : "Enviar fotos"}</button></>}
    </div>
    {queue.length > 0 && <ul className="max-h-64 space-y-3 overflow-auto rounded-xl border border-slate-200 p-4 print:hidden">{queue.map((item, index) => <li key={index} className="text-sm"><div className="flex justify-between gap-3"><span className="truncate">{item.file.name}</span><span>{item.status} {item.status === "enviando" ? `${item.progress}%` : ""}</span></div>{item.status === "enviando" && <progress aria-label={`Envio de ${item.file.name}`} className="mt-1 w-full accent-emerald-700" max={100} value={item.progress} />}{item.error && <p className="mt-1 text-red-700">{item.error}</p>}</li>)}</ul>}
    {message && <p role="status" className="rounded-xl bg-slate-100 p-4 text-sm">{message}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Fotos armazenadas · {images.length}</h3><div className="flex gap-3 print:hidden"><button onClick={() => router.refresh()} disabled={busy} className="text-sm font-semibold text-emerald-800">Atualizar</button><button onClick={exportInventory} className="text-sm font-semibold text-emerald-800">Exportar ficha</button><button onClick={() => window.print()} className="text-sm font-semibold text-emerald-800">Imprimir</button></div></div>
    {images.length === 0 ? <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">Nenhuma foto enviada. Selecione as imagens originais do seu voo para começar.</div> : <div className="max-h-96 overflow-auto print:max-h-none print:overflow-visible rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-3">Arquivo</th><th className="p-3">Tamanho</th><th className="p-3 print:hidden">Visualizar</th></tr></thead><tbody>{images.map(image => <tr key={image.name} className="border-t border-slate-100"><td className="max-w-56 truncate p-3" title={originalName(image.name)}>{originalName(image.name)}</td><td className="whitespace-nowrap p-3">{sizeLabel(Number(image.metadata?.size ?? 0))}</td><td className="p-3 print:hidden"><button disabled={opening !== null} onClick={() => preview(image)} className="font-semibold text-emerald-800">{opening === image.name ? "Abrindo…" : "Abrir ↗"}</button></td></tr>)}</tbody></table></div>}
  </div>;
}

export function SurveySearch({ surveys, activeId }: { surveys: Survey[]; activeId?: string }) {
  const [search, setSearch] = useState("");
  const filtered = surveys.filter(s => `${s.name} ${s.location}`.toLowerCase().includes(search.toLowerCase()));
  return <><input aria-label="Buscar levantamentos" className={input} placeholder="Buscar levantamento ou local…" value={search} onChange={event => setSearch(event.target.value)} /><div className="mt-4 space-y-2">{filtered.map(s => <Link key={s.id} href={`/painel?levantamento=${s.id}`} className={`block rounded-xl border p-4 ${activeId === s.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-300"}`}><p className="break-words font-semibold">{s.name}</p><p className="mt-1 text-xs text-slate-500">{s.location || "Local não informado"}</p><p className="mt-2 text-xs text-slate-500">{s.flight_date?.split("-").reverse().join("/") || "Data a definir"}</p></Link>)}{filtered.length === 0 && <p className="py-6 text-sm text-slate-500">{surveys.length ? "Nenhum resultado para esta busca." : "Seu primeiro levantamento começa aqui."}</p>}</div></>;
}


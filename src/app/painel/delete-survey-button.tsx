"use client";

import { useActionState, useId, useRef } from "react";
import type { Survey } from "@/lib/supabase/surveys";
import { deleteSurvey } from "./survey-actions";

type Props = {
  survey: Pick<Survey, "id" | "name" | "deletion_requested_at">;
  processing?: boolean;
  compact?: boolean;
};

export default function DeleteSurveyButton({ survey, processing = false, compact = false }: Props) {
  const [state, action, pending] = useActionState(deleteSurvey, {});
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const blockedId = useId();
  const incomplete = Boolean(survey.deletion_requested_at);
  const label = incomplete ? "Concluir exclusão" : compact ? "Apagar" : "Apagar levantamento";

  function open() {
    if (processing || pending || !dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    cancel.current?.focus();
  }

  return <>
    <button ref={trigger} type="button" onClick={open} disabled={processing || pending} aria-haspopup="dialog" aria-describedby={processing ? blockedId : undefined} title={processing ? "Aguarde o processamento terminar para apagar." : undefined} className={`inline-flex items-center justify-center rounded-xl border border-red-200 bg-white font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 ${compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm"}`}>
      {pending ? "Apagando…" : label}
    </button>
    {processing ? <span id={blockedId} className="sr-only">Aguarde o processamento terminar para apagar este levantamento.</span> : null}
    <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { if (pending) event.preventDefault(); }} onClose={() => trigger.current?.focus()} className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 sm:p-7">
      <h2 id={titleId} className="text-xl font-semibold">{incomplete ? "Concluir exclusão" : "Apagar levantamento?"}</h2>
      <p className="mt-3 break-words rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold [overflow-wrap:anywhere]">{survey.name}</p>
      <p id={descriptionId} className="mt-4 text-sm leading-6 text-slate-600">{incomplete ? "A exclusão já foi iniciada. Confirme novamente para remover o restante das fotos, dos resultados, das medições e dos planos vinculados." : "Este levantamento será apagado permanentemente, junto com as fotos, os resultados, as medições e os planos vinculados."} Esta ação não pode ser desfeita.</p>
      <form action={action} onSubmit={event => { if (pending || processing) event.preventDefault(); }} className="mt-5" aria-busy={pending}>
        <input type="hidden" name="id" value={survey.id} />
        <input type="hidden" name="name" value={survey.name} />
        {state.error && !pending ? <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-800">{state.error}</p> : null}
        {pending ? <p role="status" className="mb-4 text-sm text-slate-600">Apagando levantamento e arquivos vinculados…</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button ref={cancel} type="button" onClick={() => { if (!pending) dialog.current?.close(); }} disabled={pending} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={pending || processing} className="rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50">{pending ? "Apagando…" : incomplete ? "Concluir exclusão" : "Apagar levantamento"}</button>
        </div>
      </form>
    </dialog>
  </>;
}

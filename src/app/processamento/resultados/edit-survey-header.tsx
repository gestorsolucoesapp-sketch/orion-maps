"use client";

import {useActionState,useState} from "react";
import type {Survey} from "@/lib/supabase/surveys";
import {saveSurvey} from "@/app/painel/survey-actions";

const field="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function EditSurveyHeader({survey}:{survey:Survey}){
  const [open,setOpen]=useState(false);
  const [state,action,pending]=useActionState(saveSurvey,{});

  if(!open)return <button type="button" onClick={()=>setOpen(true)} className="mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 print:hidden">✎ Editar dados do levantamento</button>;

  return <div className="mt-4 rounded-2xl border border-emerald-200 bg-[#f7faf5] p-4 print:hidden">
    <div className="mb-3 flex items-center justify-between gap-3">
      <strong className="text-sm text-slate-900">Editar dados do levantamento</strong>
      <button type="button" onClick={()=>setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-600" aria-label="Fechar">×</button>
    </div>
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={survey.id}/>
      <label className="text-xs font-semibold text-slate-600">Nome do levantamento<input name="name" required minLength={2} maxLength={120} defaultValue={survey.name} className={"mt-1 "+field}/></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">Local<input name="location" maxLength={200} defaultValue={survey.location} className={"mt-1 "+field}/></label>
        <label className="text-xs font-semibold text-slate-600">Data do voo<input name="flight_date" type="date" defaultValue={survey.flight_date??""} className={"mt-1 "+field}/></label>
      </div>
      <label className="text-xs font-semibold text-slate-600">Drone / câmera<input name="drone" maxLength={100} defaultValue={survey.drone} className={"mt-1 "+field}/></label>
      <label className="text-xs font-semibold text-slate-600">Anotações<textarea name="notes" rows={3} maxLength={3000} defaultValue={survey.notes} className={"mt-1 "+field}/></label>
      {state.error&&<p className="rounded-xl bg-red-50 p-3 text-xs text-red-800">{state.error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending?"Salvando…":"Salvar alterações"}</button>
        <button type="button" onClick={()=>setOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button>
      </div>
    </form>
  </div>;
}

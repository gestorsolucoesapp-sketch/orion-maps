"use client";
import {useState} from 'react';
import {checkProcessingEngine} from './engine-actions';
import type {EngineStatus} from './engine-client';
export default function EnginePanel(){
 const [status,setStatus]=useState<EngineStatus|null>(null),[busy,setBusy]=useState(false);
 async function check(){setBusy(true);try{setStatus(await checkProcessingEngine());}catch{setStatus({state:"unavailable",message:"Não foi possível verificar. Entre novamente na conta e tente outra vez."});}finally{setBusy(false);}}
 return <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>Conexão com o processamento</strong><p className="mt-1 text-sm text-slate-600">{status?.state==='ready'?'Conexão validada · ODM '+status.version:'Preparação disponível · execução ainda não habilitada'}</p></div><button type="button" disabled={busy} onClick={check} className="rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Verificando…':'Testar conexão'}</button></div><p role="status" className="mt-3 text-sm">{status?.message||'Escolha onde executar o motor. O teste verifica apenas a conexão; não envia fotos nem cria tarefas.'}</p><p className="mt-2 text-xs text-slate-600">Etapas: conectar servidor → configurar fila privada → processar fotos → conferir resultados.</p></section>;
}

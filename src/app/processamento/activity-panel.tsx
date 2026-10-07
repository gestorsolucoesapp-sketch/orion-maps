"use client";
import {activityFresh, since, type ProcessingActivity} from "@/lib/processing-activity";
import ActivityLiveCharts from "./activity-live-charts";
import {memoryUsagePercent} from "@/lib/activity-charts";

const states: Record<string, {label:string; tone:string; text:string}> = {
  advancing: {label:"Atividade confirmada",tone:"border-emerald-200 bg-emerald-50 text-emerald-950",text:"O motor gravou arquivos ou registrou avanço recentemente."},
  computing: {label:"CPU em atividade",tone:"border-sky-200 bg-sky-50 text-sky-950",text:"Há uso de CPU no motor. Aguardando a próxima gravação; isso não comprova avanço da reconstrução por si só."},
  observing: {label:"Observando atividade",tone:"border-slate-200 bg-slate-50 text-slate-700",text:"Comparando leituras para detectar o próximo avanço real."},
  quiet: {label:"Sem avanço detectado",tone:"border-amber-200 bg-amber-50 text-amber-950",text:"Sem mudança recente nos arquivos monitorados e sem uso relevante de CPU. Isso não confirma travamento; nenhuma tarefa será reiniciada automaticamente."},
  engine_completed: {label:"Etapa do motor concluída",tone:"border-emerald-200 bg-emerald-50 text-emerald-950",text:"O NodeODM terminou. O Orion ainda precisa concluir os produtos e o envio dos resultados."},
  engine_stopped: {label:"Motor interrompido",tone:"border-red-200 bg-red-50 text-red-950",text:"O motor informou erro ou cancelamento. Consulte os detalhes técnicos."},
  unavailable: {label:"Atividade não verificada",tone:"border-slate-200 bg-slate-50 text-slate-700",text:"Não foi possível medir arquivos e recursos do motor. A conexão do agente, sozinha, não confirma avanço."},
};

export default function ActivityPanel({sample,taskId,now}:{sample?:ProcessingActivity|null;taskId:string|null;now:number}){
  const valid=!!sample && sample.schema_version===1 && !!taskId && sample.engine_task_uuid===taskId;
  const fresh=valid && activityFresh(sample,taskId,now);
  if(!valid)return <section data-testid="activity-panel" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><strong>Atividade real do motor</strong><p className="mt-1 text-xs leading-5">Aguardando a primeira leitura do monitor. O percentual por etapas continua acima.</p></section>;
  const view=!now?states.observing:!fresh?{label:"Monitor sem atualização",tone:"border-amber-200 bg-amber-50 text-amber-950",text:"A leitura de atividade está atrasada. Os números abaixo são a última amostra, não uma confirmação de atividade atual."}:states[sample.state]||states.unavailable;
  const count=(value:number|null)=>typeof value==="number"&&Number.isFinite(value)?value.toLocaleString("pt-BR"):"—";
  const events=Array.isArray(sample.events)?sample.events.slice(-3).reverse():[];
  const memoryPercent=memoryUsagePercent(sample.memory);
  return <section data-testid="activity-panel" data-sampled-at={sample.sampled_at} data-fresh={fresh?"true":"false"} className={`mt-4 min-w-0 rounded-xl border p-4 ${view.tone}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-bold">Atividade real do motor</h4>
      <span className="inline-flex items-center gap-2 text-xs font-semibold" role="status">
        <span aria-hidden className={`h-2 w-2 rounded-full bg-current ${fresh?"":"opacity-40"}`}/>{view.label}
      </span>
    </div>
    <p className="mt-2 text-xs leading-5">{view.text}</p>
    <ActivityLiveCharts sample={sample} taskId={taskId} fresh={fresh}/>
    <dl className="mt-3 grid min-w-0 grid-cols-2 gap-2">
      <div className="min-w-0 rounded-lg bg-white/80 p-3"><dt className="text-[11px] text-slate-600">Mapas de profundidade gravados</dt><dd data-testid="depth-count" className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{sample.depth_maps_truncated?"≥ ":""}{count(sample.depth_maps)}</dd></div>
      <div className="min-w-0 rounded-lg bg-white/80 p-3"><dt className="text-[11px] text-slate-600">Novos desde o início do monitor</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{typeof sample.depth_maps_added==="number"?"+":""}{count(sample.depth_maps_added)}</dd></div>
      <div className="min-w-0 rounded-lg bg-white/80 p-3"><dt className="text-[11px] text-slate-600">CPU do motor</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{sample.cpu_percent===null||!Number.isFinite(sample.cpu_percent)?"—":`${sample.cpu_percent.toLocaleString("pt-BR",{maximumFractionDigits:1})}%`}</dd></div>
      <div className="min-w-0 rounded-lg bg-white/80 p-3"><dt className="text-[11px] text-slate-600">Memória do motor / limite</dt><dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-900">{sample.memory||"—"}</dd>{memoryPercent!==null&&<><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="meter" aria-label="Uso de memória do contêiner" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,memoryPercent)}><div className="h-full rounded-full bg-emerald-700" style={{width:`${Math.min(100,memoryPercent)}%`}}/></div><p className="mt-1 text-[10px] text-slate-600">{memoryPercent.toLocaleString("pt-BR",{maximumFractionDigits:1})}% do limite de memória</p></>}</div>
    </dl>
    <div className="mt-3 space-y-1 text-xs leading-5">
      <p>Último avanço observado: <strong>{since(sample.last_change_at,now)}</strong></p>
      {sample.latest_file&&<p className="break-all">Último arquivo: <span className="font-mono">{sample.latest_file.name}</span></p>}
      <p data-testid="activity-updated">Leitura do monitor: <strong>{since(sample.sampled_at,now)}</strong></p>
    </div>
    {events.length>0&&<div data-testid="activity-events" className="mt-3 border-t border-current/10 pt-3 text-xs">
      <h5 className="font-semibold">Últimos avanços registrados</h5>
      <ol className="mt-2 space-y-2">{events.map((event,index)=><li key={`${event.at}-${index}`} className="break-words"><time className="font-mono">{new Date(event.at).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour12:false})}</time> · {event.message}</li>)}</ol>
    </div>}
    <p className="mt-3 text-[10px] leading-4 opacity-80">Leitura a cada 10 s. Arquivos intermediários não equivalem a fotos concluídas. CPU e memória são do contêiner NodeODM, não percentuais de conclusão. A CPU pode ultrapassar 100% ao usar vários núcleos; o gráfico mantém a escala indicada.</p>
  </section>;
}

"use client";
import {useMemo} from "react";
import {activityChart,activityChartPaths,chartTime} from "@/lib/activity-charts";
import type {ProcessingActivity} from "@/lib/processing-activity";
import "./activity-live-charts.css";

const number=(value:number|null,digits=1)=>value===null?"—":value.toLocaleString("pt-BR",{maximumFractionDigits:digits});
export default function ActivityLiveCharts({sample,taskId,fresh}:{sample:ProcessingActivity;taskId:string|null;fresh:boolean}) {
  const chart=useMemo(()=>activityChart(sample,taskId),[sample,taskId]);
  const cpuPaths=useMemo(()=>activityChartPaths(chart,"cpu"),[chart]);
  const filePaths=useMemo(()=>activityChartPaths(chart,"files",300,38),[chart]);
  const latest=chart.points.at(-1);
  const observed=(chart.points.length>=2)?Math.round((chart.points.at(-1)!.at-chart.points[0].at)/1000):0;
  const newFiles=chart.filesDelta;
  return <section data-testid="activity-live-charts" data-chart-sample={sample.sampled_at} data-chart-state={fresh?"live":"stale"} className={`activity-live-charts ${fresh?"":"is-stale"}`}>
    <div className="telemetry-heading">
      <div><h5>Leituras ao vivo</h5><p>Dados recebidos do motor · últimos 5 min</p></div>
      <span className="telemetry-badge">{fresh?"AO VIVO":"ÚLTIMA LEITURA"}</span>
    </div>
    <div className="telemetry-value-row">
      <span>Uso de CPU</span><strong data-testid="live-cpu-value">{number(latest?.cpu??null)}{latest?.cpu!==null&&latest?.cpu!==undefined?"%":""}</strong>
    </div>
    <div className="telemetry-plot">
      <div className="telemetry-axis"><span>{number(chart.cpuMax,0)}%</span><span>0%</span></div>
      <svg viewBox="-2 -4 304 80" preserveAspectRatio="none" role="img" aria-label="Gráfico do uso de CPU nas leituras recebidas" data-testid="live-cpu-chart">
        {[0,36,72].map(y=><line key={y} x1="0" x2="300" y1={y} y2={y} className="telemetry-grid"/>)}
        {cpuPaths.map((d,i)=><path key={i} d={d} data-testid="cpu-sample-path" fill="none" className="telemetry-cpu-path" vectorEffect="non-scaling-stroke"/>)}
        {latest?.cpu!==null&&latest?.cpu!==undefined&&<circle cx="300" cy={72-latest.cpu/chart.cpuMax*72} r="2.5" className="telemetry-cpu-dot"/>}
      </svg>
    </div>
    <div className="telemetry-time-axis"><span>{chartTime(chart.start)}</span><span>{chartTime(chart.sampledAt)}</span></div>
    <p className="telemetry-summary">Média das amostras <b>{number(chart.cpuMean)}%</b> · pico <b>{number(chart.cpuPeak)}%</b></p>
    <div className="telemetry-files-heading"><span>Mapas de profundidade no disco</span><strong>{number(latest?.files??null,0)}</strong></div>
    <svg className="telemetry-files-plot" viewBox="-2 -3 304 44" preserveAspectRatio="none" role="img" aria-label={`Histórico da quantidade de mapas de profundidade, escala de zero a ${chart.filesMax}`} data-testid="live-files-chart">
      <line x1="0" x2="300" y1="38" y2="38" className="telemetry-grid"/>
      {filePaths.map((d,i)=><path key={i} d={d} fill="none" className="telemetry-files-path" vectorEffect="non-scaling-stroke"/>)}
      {latest?.files!==null&&latest?.files!==undefined&&<circle cx="300" cy={38-latest.files/chart.filesMax*38} r="2.2" className="telemetry-files-dot"/>}
    </svg>
    <p className="telemetry-summary" data-testid="file-window-change">{newFiles===null?"Aguardando leituras contínuas para comparar os arquivos.":newFiles===0?"Contagem sem aumento nesta janela; o motor pode estar trabalhando em outros arquivos.":`+${number(newFiles,0)} arquivo(s) nesta janela observada.`}</p>
    <div className="telemetry-receipt"><span key={fresh?sample.sampled_at:"stale"} className={fresh?"telemetry-received":""} aria-hidden>●</span><span data-testid="telemetry-receipt">{fresh?"Recebido":"Último recebimento"} às <b>{chartTime(chart.sampledAt)}</b> · {chart.samples} {chart.samples===1?"leitura":"leituras"}{observed>0?` em ${observed<60?`${observed} s`:`${Math.floor(observed/60)} min ${observed%60} s`}`:""}</span></div>
    <p className="telemetry-note">O gráfico muda com novas leituras, não com o relógio. Falhas de leitura deixam lacunas. CPU e arquivos não são porcentagens de conclusão.</p>
  </section>;
}

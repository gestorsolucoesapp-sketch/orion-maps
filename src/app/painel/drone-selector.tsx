"use client";
import {useEffect,useRef,useState} from "react";
import InfoPopover from "@/components/info-popover";
import {droneProfiles} from "@/lib/drone-cameras";
import {catalogueConfig,customConfig,SUGGESTED_DRONE,validateCustomDrone,type CustomDroneProfile,type SurveyDroneConfig} from "@/lib/survey-planning";
import {createCustomDroneProfile,listCustomDroneProfiles} from "./drone-actions";
const input="mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 focus:border-emerald-600";
const blank={name:"",label:"",sensor:"",fov:"",equivalentFocal:"",imageWidth:"",imageHeight:"",minInterval:"",source:"",features:""};
export default function DroneSelector({value,onChange,formId}:{value:SurveyDroneConfig;onChange:(v:SurveyDroneConfig)=>void;formId:string}){
 const [registered,setRegistered]=useState<CustomDroneProfile[]>([]),[open,setOpen]=useState(false),[fields,setFields]=useState(blank),[error,setError]=useState(""),[listError,setListError]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const lock=useRef(false),requestId=useRef<string|null>(null);
 useEffect(()=>{let active=true;listCustomDroneProfiles().then(r=>{if(active){setRegistered(r.rows);setListError(r.error);}}).catch(()=>{if(active)setListError("Não foi possível consultar os drones cadastrados.");});return()=>{active=false;};},[]);
 const currentCatalogue=droneProfiles.find(p=>p.name===value.name),cameras=currentCatalogue?.cameras||(value.camera?[value.camera]:[]),camera=value.camera;
 const selected=value.custom_id?`custom:${value.custom_id}`:currentCatalogue?value.name:"legacy";
 function pick(key:string){setMessage("");if(key==="new"){setOpen(true);return;}const custom=registered.find(p=>`custom:${p.id}`===key);const config=custom?customConfig(custom):catalogueConfig(key);if(config)onChange(config);}
 async function register(){
  if(lock.current)return;setError("");setMessage("");
  try{
   requestId.current ||= crypto.randomUUID();
   const candidate=validateCustomDrone({id:requestId.current,name:fields.name,source:fields.source,features:fields.features,camera:{label:fields.label,sensor:fields.sensor,fov:Number(fields.fov),equivalentFocal:Number(fields.equivalentFocal),imageWidth:Number(fields.imageWidth),imageHeight:Number(fields.imageHeight),minInterval:fields.minInterval.trim()?Number(fields.minInterval):null}});
   lock.current=true;setBusy(true);const result=await createCustomDroneProfile(candidate);if(result.error||!result.row)throw Error(result.error||"Cadastro não confirmado.");
   setRegistered(rows=>[result.row!,...rows.filter(p=>p.id!==result.row!.id)]);onChange(customConfig(result.row));setOpen(false);setFields(blank);requestId.current=null;setListError("");setMessage("Drone cadastrado na sua conta.");
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível cadastrar o drone.");}finally{lock.current=false;setBusy(false);}
 }
 function field(key:keyof typeof blank,value:string){setFields(f=>({...f,[key]:value}));requestId.current=null;}
 return <section data-testid="survey-drone-selector" className="min-w-0 rounded-2xl border border-slate-200 p-4">
  <input form={formId} type="hidden" name="drone" value={value.name}/><input form={formId} type="hidden" name="drone_config" value={JSON.stringify(value)}/>
  <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Drone / câmera</h2><InfoPopover title="Especificações e recursos do drone">
   <h3>{value.name||"Drone não selecionado"}</h3>
   {camera?<dl>{[["Câmera",camera.label],["Sensor",camera.sensor],["FOV diagonal",`${camera.fov}°`],["Focal equivalente",`${camera.equivalentFocal} mm`],["Foto",`${camera.imageWidth} × ${camera.imageHeight} px${camera.estimatedResolution?" · dimensões estimadas":""}`],["Intervalo mínimo do perfil",camera.minInterval===null?"Não informado ou não listado neste modo":`${camera.minInterval} s`]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>:<p>O nome anterior foi preservado. Selecione um perfil ou cadastre a câmera para preencher as especificações.</p>}
   {camera?.estimatedResolution&&<p>As dimensões do modo reduzido são estimadas a partir da resolução máxima. Confirme as dimensões dos arquivos capturados.</p>}
   {value.features&&<p>{value.features}</p>}{value.source&&<p><a href={value.source} target="_blank" rel="noopener noreferrer">{value.custom_id?"Fonte informada no cadastro":"Especificações do fabricante"} ↗</a></p>}
   {value.custom_id&&<p>Especificações fornecidas no cadastro particular. Não foram verificadas pelo fabricante dentro do Orion.</p>}
   <h3>Recursos no Orion Maps</h3><p>Planejamento por waypoints, grades simples e cruzadas, grade oblíqua, corredor e órbita. Cálculo de cobertura e GSD, medições e simulação virtual em 2D/3D.</p>
   {value.name===SUGGESTED_DRONE&&<p>O planejador utiliza o perfil do Mini 5 Pro. Exportação de fotos automáticas por tempo/distância continua experimental; a simulação não comanda a aeronave. A transferência ao RC 2 permanece uma ação separada, com confirmação.</p>}
   <p>O cadastro fica na sua conta. Cadastrar um modelo não habilita controles de voo nem certifica compatibilidade com uma missão executável.</p>
  </InfoPopover></div>
  <label className="block text-sm">Modelo do drone<select aria-label="Modelo do drone do levantamento" className={input} value={selected} disabled={busy} onChange={e=>pick(e.target.value)}>
   {!currentCatalogue&&!value.custom_id&&<option value="legacy">{value.name||"Selecionar modelo"}</option>}
   {value.custom_id&&!registered.some(p=>p.id===value.custom_id)&&<option value={`custom:${value.custom_id}`}>{value.name}</option>}
   <optgroup label="Catálogo">{[...droneProfiles].sort((a,b)=>a.name===SUGGESTED_DRONE?-1:b.name===SUGGESTED_DRONE?1:0).map(p=><option key={p.name} value={p.name}>{p.name}{p.name===SUGGESTED_DRONE?" · sugerido":""}</option>)}</optgroup>
   {registered.length>0&&<optgroup label="Meus drones">{registered.map(p=><option key={p.id} value={`custom:${p.id}`}>{p.name}</option>)}</optgroup>}<option value="new">+ Cadastrar outro drone</option>
  </select></label>
  {cameras.length>0&&<label className="mt-3 block text-sm">Câmera / modo da foto<select aria-label="Câmera do levantamento" className={input} value={camera?.id||cameras[0].id} onChange={e=>{const c=cameras.find(c=>c.id===e.target.value);if(c)onChange({...value,camera:{...c}});}}>{cameras.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
  <button type="button" disabled={busy} onClick={()=>{setOpen(v=>!v);setError("");}} className="mt-3 min-h-11 rounded-xl border border-emerald-800/30 px-3 py-2 text-sm font-semibold text-emerald-900">{open?"Cancelar cadastro":"+ Cadastrar outro drone"}</button>
  {listError&&<p role="alert" className="mt-2 text-sm text-amber-900">{listError} <button type="button" className="underline" onClick={()=>{void listCustomDroneProfiles().then(r=>{setRegistered(r.rows);setListError(r.error);});}}>Atualizar lista</button></p>}
  {open&&<div className="mt-4 rounded-xl bg-slate-50 p-3" role="region" aria-label="Cadastrar outro drone"><div className="grid min-w-0 gap-3 sm:grid-cols-2">
   {([['name','Nome do novo drone'],['label','Nome da câmera'],['sensor','Sensor'],['fov','FOV diagonal (°)'],['equivalentFocal','Focal equivalente (mm)'],['imageWidth','Largura da foto (px)'],['imageHeight','Altura da foto (px)'],['minInterval','Intervalo mínimo (s), opcional']] as [keyof typeof blank,string][]).map(([key,label])=><label key={key} className="block min-w-0 text-sm">{label}<input aria-label={label} className={input} type={['fov','equivalentFocal','imageWidth','imageHeight','minInterval'].includes(key)?"number":"text"} step="any" maxLength={100} value={fields[key]} disabled={busy} onChange={e=>field(key,e.target.value)}/></label>)}
  </div><label className="mt-3 block text-sm">Fonte das especificações, opcional<input aria-label="Fonte das especificações" className={input} maxLength={500} type="url" value={fields.source} disabled={busy} onChange={e=>field("source",e.target.value)}/></label><label className="mt-3 block text-sm">Recursos, opcional<textarea aria-label="Recursos do novo drone" className={input} rows={2} maxLength={1000} value={fields.features} disabled={busy} onChange={e=>field("features",e.target.value)}/></label>
  {error&&<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}<button type="button" disabled={busy} onClick={()=>void register()} className="mt-3 min-h-11 rounded-xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white">{busy?"Cadastrando…":"Salvar drone na conta"}</button></div>}
  {message&&<p role="status" className="mt-3 text-sm text-emerald-800">{message}</p>}
 </section>;
}

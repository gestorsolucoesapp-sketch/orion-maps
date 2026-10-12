"use client";
import GoogleMapsImport from "@/components/google-maps-import";
import type {ImportedMapLocation} from "@/lib/google-maps-location";
import InfoPopover from "@/components/info-popover";

import dynamic from "next/dynamic";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {unzipSync,strFromU8} from "fflate";
import {generateGrid,parseBoundaryGeoJson,validateBoundary,type Coordinate} from "@/lib/flight-plan";
import {segmentAvoidsHoles,validateExclusions} from "@/lib/flight-exclusions";
import {droneProfiles,type CameraProfile,type DroneProfile} from "@/lib/drone-cameras";
import {routeMetrics,formatFlightTime} from "@/lib/mission-metrics";
import {calculateGsd} from "@/lib/gsd";
import {missionCsv,previewKmz} from "@/lib/mission-export";
import "./waypoints.css";
import "./flight-simulator.css";
import RcTransfer from "./rc-transfer";
import MapToolRail,{type MapRailTool} from "./map-tool-rail";
import type {Basemap} from "./planning-canvas";
import {photoMissionKmz,photoMissionRoute,type CaptureMode} from "@/lib/photo-mission";
import {compareKmzToPlan,inspectKmz,type ExpectedKmz,type InspectedKmz} from "@/lib/kmz-inspection";
import {orbitRoute,corridorRoute,flightWarnings} from "@/lib/advanced-missions";
import {getSurveyPlanningContext} from "./survey-context";
import {registeredDroneProfile} from "@/lib/survey-planning";
import {saveMissionVersion,listMissionVersions,readMissionVersion,latestMissionVersionForName} from "./history-actions";
const PlanningCanvas=dynamic(()=>import("./planning-canvas"),{ssr:false,loading:()=> <div className="mission-map loading-map">Preparando editor…</div>});
const FlightSimulator=dynamic(()=>import("./flight-simulator"),{ssr:false,loading:()=> <div role="status" className="flight-message">Preparando simulador de voo…</div>});
const KmzFileSimulator=dynamic(()=>import("./flight-simulator").then(module=>module.KmzFileSimulator),{ssr:false,loading:()=> <div role="status" className="flight-message">Lendo a prévia do KMZ…</div>});
const TerrainFlightPlanner=dynamic(()=>import("./terrain-flight-planner"),{ssr:false,loading:()=> <div role="status" className="flight-message">Preparando análise do relevo…</div>});
type Mode="manual"|"grid"|"double"|"orbit"|"corridor"|"oblique";
type Settings={diagonalFov?:number;height:number;speed:number;gimbal:number;bearing:number;front:number;side:number;sensorWidth:number;sensorHeight:number;focal:number;imageWidth:number;imageHeight:number};
type SurveySource={id:string;name:string;createdAt:string};
type Plan={captureMode?:CaptureMode;captureDistance?:number;takeoff?:Coordinate;perimeterPass?:boolean;exclusions?:Coordinate[][];surveySource?:SurveySource;version:1;name:string;mode:Mode;points:Coordinate[];settings:Settings;drone:string;cameraId?:string;batteryMinutes?:number;batteryFullMinutes?:number;photoInterval?:number;corridorWidth?:number;orbitSamples?:number};
type CloudCandidate={id:string;name:string;kind:string;created_at:string;plan:unknown;target_id:string|null};
const defaults:Settings={height:100,speed:5,gimbal:-90,bearing:0,front:80,side:70,sensorWidth:13.2,sensorHeight:8.8,focal:8.8,imageWidth:4096,imageHeight:3072,diagonalFov:84};
const number=(n:number,digits=1)=>n.toLocaleString("pt-BR",{maximumFractionDigits:digits});
const distance=(a:Coordinate,b:Coordinate)=>{const k=Math.PI/180;return Math.hypot((b[0]-a[0])*k*Math.cos((a[1]+b[1])/2*k),(b[1]-a[1])*k)*6371008.8;};
const storageKey="orion-missions-v1";
function validPoint(p:unknown):p is Coordinate{return Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==="number"&&Number.isFinite(n))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=75;}
function validatePlanBase(value:unknown):Plan{const p=value as Plan;if(!p||p.version!==1||typeof p.name!=="string"||p.name.length>120||!["manual","grid","double","orbit","corridor","oblique"].includes(p.mode)||!Array.isArray(p.points)||p.points.length>200||!p.points.every(validPoint)||!p.settings||Object.keys(defaults).some(key=>!Number.isFinite(p.settings[key as keyof Settings]))||typeof p.drone!=="string"||p.drone.length>100)throw new Error("Plano Orion inválido ou de versão não suportada.");if(p.takeoff!==undefined&&!validPoint(p.takeoff))throw new Error("Ponto de decolagem inválido.");if(p.settings.diagonalFov!==undefined&&(!Number.isFinite(p.settings.diagonalFov)||p.settings.diagonalFov<=0||p.settings.diagonalFov>=180))throw new Error("Campo de visão inválido.");if(p.cameraId!==undefined&&(typeof p.cameraId!=="string"||p.cameraId.length>100))throw new Error("Câmera inválida.");if(p.batteryMinutes!==undefined&&(!Number.isFinite(p.batteryMinutes)||p.batteryMinutes<=0||p.batteryMinutes>180))throw new Error("Minutos úteis por bateria inválidos.");if(p.batteryFullMinutes!==undefined&&(!Number.isFinite(p.batteryFullMinutes)||p.batteryFullMinutes<=0||p.batteryFullMinutes>180))throw new Error("Autonomia total por bateria inválida.");if(p.photoInterval!==undefined&&(!Number.isFinite(p.photoInterval)||p.photoInterval<1||p.photoInterval>60))throw new Error("Intervalo de foto inválido.");if(p.corridorWidth!==undefined&&(!Number.isFinite(p.corridorWidth)||p.corridorWidth<5||p.corridorWidth>500))throw new Error("Largura do corredor inválida.");if(p.orbitSamples!==undefined&&(!Number.isInteger(p.orbitSamples)||p.orbitSamples<12||p.orbitSamples>180))throw new Error("Quantidade de pontos da órbita inválida.");return p;}
function validatePlan(value:unknown):Plan{
 const p=validatePlanBase(value);
 if(p.surveySource!==undefined){const s=p.surveySource;if(!s||typeof s!=="object"||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s.id)||typeof s.name!=="string"||!s.name.trim()||s.name.length>120||typeof s.createdAt!=="string"||!Number.isFinite(Date.parse(s.createdAt)))throw new Error("Origem do levantamento inválida.");}
 if(p.perimeterPass!==undefined&&typeof p.perimeterPass!=="boolean")throw new Error("A passagem pelo perímetro deve estar ativada ou desativada.");
 if(p.exclusions!==undefined){
  if(!Array.isArray(p.exclusions)||p.exclusions.length>20||p.exclusions.some(ring=>!Array.isArray(ring)||ring.length<3||ring.length>100||!ring.every(validPoint)))throw new Error("Áreas isoladas inválidas.");
  if(p.exclusions.length)validateExclusions(p.points,p.exclusions);
 }
 return p;
}
function download(content:BlobPart,type:string,name:string){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export default function WaypointsPage(){
 const [workspaceTab,setWorkspaceTab]=useState<"planning"|"simulation">("planning");
 const [mapFullscreen,setMapFullscreen]=useState(false);
 const [terrainOpen,setTerrainOpen]=useState(false);
 const [mapPanel,setMapPanel]=useState<"mode"|"search"|"settings"|"altitude"|"layers"|"local"|"area"|"exclusions"|null>(null);
 const [mapBasemap,setMapBasemap]=useState<Basemap>("satellite");
 const [measureAreaRevision,setMeasureAreaRevision]=useState(0),[measurePathRevision,setMeasurePathRevision]=useState(0);
 const [measuring,setMeasuring]=useState(false);
 useEffect(()=>{
  if(!mapFullscreen)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape")setMapFullscreen(false);};
  window.addEventListener("keydown",onKeyDown);
  return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener("keydown",onKeyDown);};
 },[mapFullscreen]);
 const [name,setName]=useState("Meu primeiro voo"),[mode,setMode]=useState<Mode>("manual"),[points,setPoints]=useState<Coordinate[]>([]),[settings,setSettings]=useState(defaults),[drone,setDrone]=useState("DJI Mini 5 Pro");
 const [exclusions,setExclusions]=useState<Coordinate[][]>([]),[exclusionDraft,setExclusionDraft]=useState<Coordinate[]>([]),[drawingExclusion,setDrawingExclusion]=useState(false);
 const [exclusionError,setExclusionError]=useState("");
 const [history,setHistory]=useState<Coordinate[][]>([]),[drawing,setDrawing]=useState(true),[center,setCenter]=useState<Coordinate|null>(null),[fit,setFit]=useState(0),[coordinate,setCoordinate]=useState(""),[message,setMessage]=useState(""),[saved,setSaved]=useState<Plan[]|null>(null);
 const [cloudBusy,setCloudBusy]=useState(false);
  const [surveySource,setSurveySource]=useState<SurveySource|null>(null);
  const [surveyChecking,setSurveyChecking]=useState(false);
  const [cloudCandidate,setCloudCandidate]=useState<CloudCandidate|null>(null);
  const [baseVersionId,setBaseVersionId]=useState<string|null>(null);
 const [saveFeedback,setSaveFeedback]=useState<{text:string;fingerprint:string;level:"success"|"warning"|"error"}|null>(null);
 const [kmzPreview,setKmzPreview]=useState<{id:string;file:InspectedKmz;label:string;sha256:string|null}|null>(null);
 const [rcReceipt,setRcReceipt]=useState<{sha256:string;waypoints:number;name:string}|null>(null);
 const [kmzPreviewError,setKmzPreviewError]=useState("");
 const [importedLocation,setImportedLocation]=useState<ImportedMapLocation|null>(null);
 const [registeredDrones,setRegisteredDrones]=useState<DroneProfile[]>([]);
 const availableDrones=useMemo(()=>[...droneProfiles,...registeredDrones],[registeredDrones]);
 const [corridorWidth,setCorridorWidth]=useState(30);
 const [orbitSamples,setOrbitSamples]=useState(36);
 const [perimeterPass,setPerimeterPass]=useState(false);
 const [versions,setVersions]=useState<{id:string;name:string;kind:string;created_at:string}[]|null>(null);
 const [batteryFullMinutes,setBatteryFullMinutes]=useState(32);
 const batteryMinutes=batteryFullMinutes*.85;
 const [photoInterval,setPhotoInterval]=useState(3);
 const [captureMode,setCaptureMode]=useState<CaptureMode>("manual");
 const [captureDistance,setCaptureDistance]=useState(12);
 const [myPlace,setMyPlace]=useState<Coordinate|null>(null);
 const [cameraId,setCameraId]=useState("wide-12");
 const selectedDrone=availableDrones.find(p=>p.name===drone);
 const candidateCamera=selectedDrone?.cameras.find(c=>c.id===cameraId);
 const selectedCamera=candidateCamera&&candidateCamera.fov===settings.diagonalFov&&candidateCamera.imageWidth===settings.imageWidth&&candidateCamera.imageHeight===settings.imageHeight?candidateCamera:undefined;
 function applyCamera(camera:CameraProfile){setCameraId(camera.id);setSettings(s=>({...s,diagonalFov:camera.fov,imageWidth:camera.imageWidth,imageHeight:camera.imageHeight}));}
 function customCamera(){setCameraId("");setSettings(s=>{const next={...s};delete next.diagonalFov;return next;});}
 const [locating,setLocating]=useState(false);
 const [adjustingPosition,setAdjustingPosition]=useState(false);
 const [userPosition,setUserPosition]=useState<{point:Coordinate;accuracy:number;source?:"manual"}|null>(null);
 const [takeoffPoint,setTakeoffPoint]=useState<Coordinate|null>(null);
 const [markingTakeoff,setMarkingTakeoff]=useState(false);
 useEffect(()=>{
  try{const raw=localStorage.getItem("orion-my-place-v1");if(!raw)return;const p:unknown=JSON.parse(raw);if(!validPoint(p))return;
   // Restore only the explicitly saved location after hydration.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   setMyPlace(p);setUserPosition({point:p,accuracy:0,source:"manual"});setCenter(p);setCoordinate(`${p[1].toFixed(6)}, ${p[0].toFixed(6)}`);
  }catch{/* An unreadable saved location must not block the editor. */}
 },[]);
 function saveMyPlace(p:Coordinate){
  try{localStorage.setItem("orion-my-place-v1",JSON.stringify(p));setMyPlace(p);adjustPosition(p);setCenter([...p]);setMessage("Meu local salvo neste navegador. Posição informada por você, não medida por GPS. Os pontos do plano foram mantidos.");}
  catch{setMessage("Não foi possível salvar seu local neste navegador.");}
 }
 function forgetMyPlace(){try{localStorage.removeItem("orion-my-place-v1");setMyPlace(null);setMessage("Local salvo removido deste navegador. A posição atual e o plano foram mantidos.");}catch{setMessage("Não foi possível remover o local salvo.");}}
 function adjustPosition(p:Coordinate){if(!validPoint(p))return;setUserPosition({point:p,accuracy:0,source:"manual"});setCoordinate(`${p[1].toFixed(6)}, ${p[0].toFixed(6)}`);setAdjustingPosition(false);setMessage("Posição informada por você. Nenhum waypoint foi criado. Esta posição não é uma medição GPS.");}
 function locateMe(){
  if(locating)return;
  if(!window.isSecureContext||!navigator.geolocation){setMessage("Este navegador não disponibilizou a localização. Use latitude e longitude no campo acima.");return;}
  setAdjustingPosition(false);setLocating(true);setMessage("Permita o acesso à localização quando o navegador solicitar.");
  navigator.geolocation.getCurrentPosition(position=>{
   setLocating(false);
   const p:Coordinate=[position.coords.longitude,position.coords.latitude];
   if(!validPoint(p)){setMessage("A localização recebida está fora da área suportada pelo planejador. Use latitude e longitude.");return;}
   setUserPosition({point:p,accuracy:position.coords.accuracy});
   setCoordinate(`${p[1].toFixed(6)}, ${p[0].toFixed(6)}`);
   setCenter(p);
   setMessage(`Localização aproximada do navegador. Latitude ${p[1].toFixed(6)}, longitude ${p[0].toFixed(6)}. Precisão aproximada: ${number(position.coords.accuracy,0)} m. Confira a posição antes de planejar.`);
  },error=>{
   setLocating(false);
   setMessage(error.code===1?"Acesso à localização bloqueado. Nas permissões deste site no navegador, permita Localização e tente novamente. Você também pode informar latitude e longitude.":error.code===3?"A localização demorou para responder. Tente novamente ou informe latitude e longitude.":"Não foi possível obter sua localização. Confira a localização do dispositivo e tente novamente, ou informe latitude e longitude.");
  },{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
 }
 function changePoints(next:Coordinate[]){setHistory(h=>[...h.slice(-49),points]);setPoints(next);setMessage("");}
 function finishExclusion(){
  try{validateExclusions(points,[...exclusions,exclusionDraft]);setExclusions([...exclusions,exclusionDraft]);setExclusionDraft([]);setDrawingExclusion(false);setExclusionError("");setMessage("Área isolada adicionada. A medida útil e as faixas foram recalculadas; confira a rota antes de salvar.");}
  catch(e){const error=e instanceof Error?e.message:"Revise os pontos da área isolada.";setExclusionError(error);setMessage(error);}
 }
 const calculation=useMemo(()=>{try{
  if(settings.height<=0||settings.height>500||settings.speed<=0||settings.speed>30||settings.gimbal< -90||settings.gimbal>0||!Object.values(settings).every(Number.isFinite))throw new Error("Revise altura (1–500 m), velocidade (0–30 m/s) e gimbal (−90 a 0°).");
  if(points.some(p=>distance(points[0],p)>20000))throw new Error("Divida o plano em áreas de até 20 km.");
  if(exclusions.length&&!(["grid","double","oblique"] as Mode[]).includes(mode))throw new Error("Áreas isoladas exigem o modo Grid ou Oblíquo. Volte a esse modo ou remova os isolamentos.");
  const gsd=calculateGsd({diagonalFov:settings.diagonalFov,sensorWidth:settings.sensorWidth,sensorHeight:settings.sensorHeight,focalLength:settings.focal,imageWidth:settings.imageWidth,imageHeight:settings.imageHeight,height:settings.height,frontOverlap:settings.front,sideOverlap:settings.side,speed:settings.speed,targetGsd:3});
   if(mode==="orbit"){const route=orbitRoute(points,orbitSamples);return {...route,captureLegs:route.legs.map(()=>true),gsd,error:""};}
   if(mode==="corridor"){const route=corridorRoute(points,corridorWidth,gsd.lineSpacing);return {...route,captureLegs:route.legs.map(()=>true),gsd,error:""};}
   if(mode==="manual"){const length=points.slice(1).reduce((s,p,i)=>s+distance(points[i],p),0);return {gsd,legs:points.length>=2?[points]:[],captureLegs:points.length>=2?[true]:[],photos:[] as Coordinate[],area:0,length,seconds:length/settings.speed,error:""};}
   if(points.length<3)return {gsd,legs:[],captureLegs:[],photos:[],area:0,length:0,seconds:0,error:""};
  if(settings.gimbal!==-90&&mode!=="oblique")throw new Error("As grades nadir exigem câmera para baixo (gimbal −90°). Use Grade oblíqua para inclinações.");
   return {...generateGrid(points,{spacing:gsd.lineSpacing,photoSpacing:gsd.photoSpacing,bearing:settings.bearing,speed:settings.speed,doubleGrid:mode==="double"||mode==="oblique",perimeterPass},exclusions),gsd,error:""};
 }catch(e){return {legs:[],photos:[],area:0,length:0,seconds:0,error:e instanceof Error?e.message:"Revise os parâmetros.",gsd:undefined,captureLegs:[] as boolean[]};}},[points,settings,mode,orbitSamples,corridorWidth,exclusions,perimeterPass]);
 const polygonMode=mode==="grid"||mode==="double"||mode==="oblique";
 const boundaryMeasure=useMemo(()=>{
  if(!polygonMode||points.length<3)return null;
  try{const outerArea=validateBoundary(points).area,net=exclusions.length?validateExclusions(points,exclusions):null;return {area:net?.area??outerArea,outerArea,excludedArea:net?.excludedArea??0,perimeter:points.reduce((sum,p,i)=>sum+distance(p,points[(i+1)%points.length]),0)};}
  catch{return null;}
 },[points,polygonMode,exclusions]);
 const metrics=routeMetrics(calculation.legs,settings.speed>0&&Number.isFinite(settings.speed)?settings.speed:5,batteryMinutes);
 const terrainRoute=useMemo(()=>calculation.legs.flat(),[calculation.legs]);
 const homeTransitionClear=useMemo(()=>{
  if(!exclusions.length||!takeoffPoint||!calculation.legs.length)return true;
  try{const {holes,projection}=validateExclusions(points,exclusions),route=calculation.legs.flat(),home=projection.toLocal(takeoffPoint);return segmentAvoidsHoles(home,projection.toLocal(route[0]),holes)&&segmentAvoidsHoles(projection.toLocal(route.at(-1)!),home,holes);}
  catch{return false;}
 },[points,exclusions,takeoffPoint,calculation.legs]);
 const fullMissionMetrics=takeoffPoint&&calculation.legs.length?routeMetrics([[takeoffPoint,...calculation.legs.flat(),takeoffPoint]],settings.speed>0&&Number.isFinite(settings.speed)?settings.speed:5,batteryMinutes):null;
 const recommendedSpeed=calculation.gsd?Math.floor(Math.min(30,calculation.gsd.photoSpacing/photoInterval)*10)/10:0;
 const intervalUnsupported=!!selectedCamera&&(selectedCamera.minInterval===null||photoInterval<selectedCamera.minInterval);
 const captureLength=calculation.legs.reduce((sum,leg,index)=>sum+(calculation.captureLegs[index]===false?0:leg.slice(1).reduce((meters,p,i)=>meters+distance(leg[i],p),0)),0);
 const photoCount=captureLength>0&&settings.speed>0?(captureMode==="distance"?(captureDistance>0?Math.floor(captureLength/captureDistance)+1:0):Math.floor(captureLength/settings.speed/photoInterval)+1):0;
 const photoBasis=captureMode==="distance"?`${number(captureDistance)} m`:`${number(photoInterval)} s`;
  const plan:Plan={version:1,name,mode,points,exclusions,perimeterPass,settings,drone,cameraId,batteryMinutes,batteryFullMinutes,photoInterval,corridorWidth,orbitSamples,captureMode,captureDistance,...(takeoffPoint?{takeoff:takeoffPoint}:{}),...(surveySource?{surveySource}:{})};
 const transferDisabled=terrainOpen||captureMode==="distance"||(captureMode==="time"&&intervalUnsupported)||!takeoffPoint||!homeTransitionClear||drawingExclusion||!!exclusionDraft.length||!calculation.legs.length||!!calculation.error||metrics.waypoints>200||settings.speed>15||settings.speed<=0||(fullMissionMetrics?.seconds??Infinity)/60>batteryMinutes;
 const safetyWarnings=flightWarnings({drone,mode,points:points.length,waypoints:metrics.waypoints,speed:settings.speed,height:settings.height,minutes:metrics.seconds/60,batteryMinutes,photoInterval,minInterval:selectedCamera?.minInterval??null,requiredInterval:calculation.gsd&&settings.gimbal===-90?calculation.gsd.interval:null,terrainConfirmed:false});
 function setField(key:keyof Settings,value:string){if(["sensorWidth","sensorHeight","focal","imageWidth","imageHeight","diagonalFov"].includes(key))setCameraId("");setSettings(s=>({...s,[key]:value===""?NaN:Number(value)}));}
 function load(p:Plan,source:SurveySource|null=p.surveySource??null){changePoints(p.points);setExclusions(p.exclusions??[]);setExclusionDraft([]);setExclusionError("");setDrawingExclusion(false);setName(p.name);setMode(p.mode);setSettings(p.settings);setDrone(p.drone);setCameraId(p.cameraId||"");setBatteryFullMinutes(p.batteryFullMinutes??(p.batteryMinutes??27)/.85);setPhotoInterval(p.photoInterval??3);setCaptureMode(p.captureMode??"manual");setCaptureDistance(p.captureDistance??12);setCorridorWidth(p.corridorWidth??30);setOrbitSamples(p.orbitSamples??36);setTakeoffPoint(p.takeoff??null);setPerimeterPass(p.perimeterPass??false);setMarkingTakeoff(false);setFit(n=>n+1);setDrawing(false);setSaved(null);setSaveFeedback(null);setSurveySource(source);setCloudCandidate(null);setBaseVersionId(null);setMessage(`Plano carregado com sobreposição lateral ${p.settings.side}%. Confira os parâmetros antes de exportar.`);}
 function expectedKmz():ExpectedKmz|null{
  if(calculation.error||!calculation.legs.length)return null;
  try{const route=captureMode==="manual"?{route:calculation.legs.flat(),captureRanges:[]}:photoMissionRoute(calculation.legs,calculation.captureLegs);
   return {...route,height:settings.height,speed:settings.speed,captureMode,interval:captureMode==="distance"?captureDistance:photoInterval};}
  catch{return null;}
 }
 function showKmzPreview(bytes:Uint8Array,label:string,sha256:string|null=null){
  const file=inspectKmz(bytes);
  setKmzPreviewError("");
  if(!sha256)setRcReceipt(null);
  setKmzPreview({id:crypto.randomUUID(),file,label,sha256});
  setMapFullscreen(false);setWorkspaceTab("simulation");
 }
 async function openKmzPreview(file:File){
  try{if(file.size>5_000_000)throw Error("Abra um KMZ de até 5 MB.");const bytes=new Uint8Array(await file.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(byte=>byte.toString(16).padStart(2,"0")).join("");showKmzPreview(bytes,`Arquivo reaberto do disco: ${file.name}`,hash);setMessage("KMZ lido do arquivo selecionado. Confira diferenças e reproduza a rota na aba de simulação. Nada foi enviado ao RC 2.");}
  catch(error){const detail=error instanceof Error?error.message:"Não foi possível ler o KMZ.";setKmzPreviewError(`Não foi possível abrir ${file.name}: ${detail}`);setMessage(detail);}
 }
 async function openRcReceipt(file:File){
  try{if(file.size>50_000)throw Error("Abra um receipt.json de até 50 KB.");const value:unknown=JSON.parse(await file.text());if(!value||typeof value!=="object")throw Error("Comprovante inválido.");const receipt=value as Record<string,unknown>;if(receipt.status!=="done"||typeof receipt.sha256!=="string"||!(/^[a-f0-9]{64}$/i).test(receipt.sha256)||typeof receipt.waypoints!=="number"||!Number.isInteger(receipt.waypoints)||receipt.waypoints<2||receipt.waypoints>500||typeof receipt.name!=="string")throw Error("Comprovante sem status, SHA-256, nome ou quantidade válida.");setRcReceipt({sha256:receipt.sha256.toLowerCase(),waypoints:receipt.waypoints,name:receipt.name.slice(0,120)});setKmzPreviewError("");if(kmzPreview)setWorkspaceTab("simulation");else setMessage("Comprovante lido. Abra também o KMZ da pasta readback para comparar os bytes e visualizar a rota.");}
  catch(error){setKmzPreviewError(error instanceof Error?error.message:"Não foi possível ler o comprovante.");}
 }
 function exportSelectedKmz(){
  if(captureMode!=="manual"){exportPhotoMission();return;}
  try{
   if(calculation.error||!calculation.legs.length||drawingExclusion||exclusionDraft.length)throw Error("Conclua a rota e os isolamentos antes de exportar.");
   const bytes=previewKmz(name,calculation.legs,settings.height,{boundary:mode==="grid"||mode==="double"||mode==="oblique"?points:undefined,exclusions,photos:calculation.photos});
   download(new Uint8Array(bytes).buffer,"application/vnd.google-earth.kmz",`${filename}-visualizacao.kmz`);
   showKmzPreview(bytes,`Gerado para download: ${filename}-visualizacao.kmz`);
   setMessage("Download iniciado e bytes do KMZ reabertos na Prévia do KMZ. Para conferir a cópia salva no disco, use Abrir KMZ para prévia. Este arquivo não contém missão executável.");
  }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível exportar o KMZ de visualização.");}
 }
 async function openCloud(){setCloudBusy(true);try{const result=await listMissionVersions();if(result.error)throw new Error(result.error);setVersions(result.rows);}catch(e){setMessage(e instanceof Error?e.message:"Falha no histórico.");}finally{setCloudBusy(false);}}
 async function recoverVersion(id:string,restore:boolean){
  setCloudBusy(true);try{const result=await readMissionVersion(id);if(result.error||!result.version)throw new Error(result.error);const v=result.version;
   if(restore){const restored=validatePlan(v.plan);load(restored,surveySource&&(v.target_id===surveySource.id||(v.target_id===null&&v.name===surveySource.name&&v.created_at>=surveySource.createdAt))?surveySource:restored.surveySource??null);setBaseVersionId(id);setVersions(null);setMessage(`Revisão ${id} da conta aberta com sobreposição lateral ${restored.settings.side}%. O histórico e o RC 2 não foram alterados.`);}
   else{const bytes=Uint8Array.from(atob(v.kmz_base64),c=>c.charCodeAt(0));download(bytes.buffer,"application/vnd.google-earth.kmz",`${v.kind==="preview"?id:v.target_id||id}.kmz`);setMessage("Cópia do histórico baixada. Nenhuma transferência para o controle foi realizada.");}
  }catch(e){setMessage(e instanceof Error?e.message:"Falha ao recuperar versão.");}finally{setCloudBusy(false);}
 }
 async function save(){
  const fingerprint=JSON.stringify(plan);
  if(exclusionDraft.length){setSaveFeedback({text:"Conclua ou cancele o desenho da área isolada antes de salvar.",fingerprint,level:"error"});return;}
  try{validatePlan(plan);}catch(e){setSaveFeedback({text:e instanceof Error?e.message:"Confira os parâmetros do plano.",fingerprint,level:"error"});return;}
  if(!points.length){setSaveFeedback({text:"Adicione pontos ao mapa antes de salvar o plano.",fingerprint,level:"error"});return;}
  setCloudBusy(true);
  setSaveFeedback({text:"Salvando o plano…",fingerprint,level:"warning"});
  let localSaved=false;
  try{
   const stored:unknown=JSON.parse(localStorage.getItem(storageKey)||"[]");
   if(!Array.isArray(stored))throw new Error("Lista local inválida.");
    localStorage.setItem(storageKey,JSON.stringify([plan,...stored].slice(0,30)));
    const readback:unknown=JSON.parse(localStorage.getItem(storageKey)||"[]");
    if(!Array.isArray(readback)||JSON.stringify(readback[0])!==fingerprint)throw new Error("A cópia local não corresponde ao plano atual.");
    localSaved=true;
  }catch{/* A falha local não impede a tentativa de salvar na nuvem. */}
  const time=new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  if(calculation.error||!calculation.legs.length){
   setSaveFeedback({text:localSaved?`Rascunho salvo neste navegador às ${time} com sobreposição lateral ${settings.side}%. A rota ainda não está pronta para salvar na nuvem: ${calculation.error||"complete os pontos."}`:"Não foi possível salvar o rascunho neste navegador. Exporte o JSON antes de sair.",fingerprint,level:localSaved?"warning":"error"});
   setCloudBusy(false);
   return;
  }
   try{
    if(surveyChecking)throw new Error("Aguarde a conferência das revisões da conta antes de salvar na nuvem.");
    if(surveySource){
     const latest=await latestMissionVersionForName(surveySource.name,surveySource.createdAt,surveySource.id);
     if(latest.error)throw new Error(`Não foi possível verificar conflitos na conta: ${latest.error}`);
     if((latest.version?.id??null)!==baseVersionId){
      setCloudCandidate(latest.version);
      throw new Error("Há outra revisão na conta. Abra e confira a revisão mais recente antes de criar uma nova versão; a cópia deste navegador foi preservada.");
     }
    }
    const bytes=previewKmz(name,calculation.legs,settings.height,{boundary:mode==="grid"||mode==="double"||mode==="oblique"?points:undefined,exclusions});
   let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
    const result=await saveMissionVersion(name,plan,btoa(binary),surveySource?.id??null);
   if(result.error||!result.id)throw new Error(result.error||"A nuvem não confirmou o salvamento.");
   const verified=await readMissionVersion(result.id);
   if(verified.error||!verified.version)throw new Error(verified.error||"A versão salva não pôde ser conferida.");
   const storedPlan=validatePlan(verified.version.plan);
    const sameSettings=Object.entries(settings).every(([key,value])=>storedPlan.settings[key as keyof Settings]===value)&&Object.entries(storedPlan.settings).every(([key,value])=>settings[key as keyof Settings]===value);
     if(verified.version.name!==name.trim()||verified.version.target_id!==(surveySource?.id??null)||storedPlan.mode!==mode||storedPlan.captureMode!==captureMode||!sameSettings||JSON.stringify(storedPlan.points)!==JSON.stringify(points)||JSON.stringify(storedPlan.exclusions??[])!==JSON.stringify(exclusions)||storedPlan.perimeterPass!==perimeterPass||JSON.stringify(storedPlan.takeoff??null)!==JSON.stringify(takeoffPoint)||JSON.stringify(storedPlan.surveySource??null)!==JSON.stringify(surveySource))throw new Error("A versão conferida não corresponde aos parâmetros e à rota atuais.");
     setBaseVersionId(result.id);setCloudCandidate(null);
    setSaveFeedback({text:`Revisão ${result.id} salva e conferida na conta às ${time} com sobreposição lateral ${settings.side}%${localSaved?"; cópia também neste navegador":"; cópia local indisponível"}. Para abrir em outro navegador, use Histórico na nuvem. O cadastro do levantamento é uma cópia separada. Não foi enviado ao RC 2.`,fingerprint,level:localSaved?"success":"warning"});
   }catch(e){const reason=e instanceof Error?e.message:"Falha ao salvar na nuvem.";setSaveFeedback({text:localSaved?`Plano salvo somente neste navegador às ${time} com sobreposição lateral ${settings.side}%. Nuvem não confirmada: ${reason}`:`Não foi possível salvar: ${reason} Exporte o JSON antes de sair.`,fingerprint,level:localSaved?"warning":"error"});}
  finally{setCloudBusy(false);}
 }
 function exportPlan(){try{if(exclusionDraft.length)throw new Error("Conclua ou cancele o isolamento antes de exportar.");validatePlan(plan);download(JSON.stringify(plan,null,2),"application/json",`${filename}.json`);}catch(e){setMessage(e instanceof Error?e.message:"Confira os parâmetros antes de exportar.");}}
 function exportPhotoMission(){try{
  if(drone!=="DJI Mini 5 Pro")throw Error("Selecione o DJI Mini 5 Pro.");
  if(calculation.error||!calculation.legs.length)throw Error("Gere a rota antes de exportar.");
  if(!takeoffPoint||drawingExclusion||exclusionDraft.length||!homeTransitionClear)throw Error("Marque a decolagem, conclua o isolamento e confira a ligação até a rota.");
  if(captureMode==='manual')throw Error("Selecione um modo de captura automática.");
  if(selectedCamera?.minInterval!==null&&selectedCamera?.minInterval!==undefined&&captureMode==='time'&&photoInterval<selectedCamera.minInterval)throw Error("Intervalo menor que o mínimo informado para a câmera.");
  const route=photoMissionRoute(calculation.legs,calculation.captureLegs);
  const bytes=photoMissionKmz({name,...route,height:settings.height,speed:settings.speed,gimbal:settings.gimbal,captureMode,interval:captureMode==='time'?photoInterval:captureDistance});
  download(bytes,"application/vnd.google-earth.kmz",`${filename}-captura-experimental.kmz`);
  showKmzPreview(bytes,`Gerado para download: ${filename}-captura-experimental.kmz`);
  setMessage("Download iniciado e bytes do KMZ reabertos na Prévia do KMZ. Para conferir a cópia salva no disco, use Abrir KMZ para prévia. O disparo no Mini 5 Pro não foi comprovado.");
 }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível exportar a captura.");}}

 function openSaved(){try{const value:unknown=JSON.parse(localStorage.getItem(storageKey)||"[]");if(!Array.isArray(value))throw new Error();const readable:Plan[]=[];for(const entry of value){try{readable.push(validatePlan(entry));}catch{/* Preserve old entries in storage, but do not block readable plans. */}}setSaved(readable);setMessage(readable.length<value.length?"Alguns planos antigos não puderam ser abertos. As cópias locais foram mantidas. Confira também o Histórico na nuvem.":"Estas são cópias deste navegador e podem estar desatualizadas. Abra o Histórico na nuvem para conferir as revisões da conta.");}catch{setMessage("Não foi possível ler os planos deste navegador.");}}
 function locate(){const p=coordinate.trim().split(/[;,\s]+/).map(Number);if(p.length!==2||!validPoint([p[1],p[0]])){setMessage("Informe latitude e longitude. Ex.: -23.55, -46.63");return;}setCenter([p[1],p[0]]);setMessage("");}
 async function importFile(file:File){try{
  if(file.size>2*1024*1024)throw new Error("Importe um arquivo de até 2 MB.");let text:string;
  if(file.name.toLowerCase().endsWith(".kmz")){const entries=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:f=>f.name.toLowerCase().endsWith(".kml")&&f.originalSize<=2*1024*1024});const kml=Object.values(entries);if(kml.length!==1)throw new Error("O KMZ deve conter um único KML de até 2 MB.");text=strFromU8(kml[0]);}else text=await file.text();
  if(text.trim().startsWith("<")){const doc=new DOMParser().parseFromString(text,"application/xml");if(doc.querySelector("parsererror"))throw new Error("KML inválido.");const polygons=doc.getElementsByTagNameNS("*","Polygon");if(polygons.length!==1||doc.getElementsByTagNameNS("*","innerBoundaryIs").length)throw new Error("Importe um KML com um único polígono sem recortes internos.");const coords=polygons[0].getElementsByTagNameNS("*","coordinates")[0]?.textContent?.trim();if(!coords)throw new Error("Coordenadas não encontradas.");changePoints(parseBoundaryGeoJson({type:"Polygon",coordinates:[coords.split(/\s+/).map(t=>t.split(",").slice(0,2).map(Number))]}));setExclusions([]);setMode("grid");}
  else{const json=JSON.parse(text);if(json.version===1){load(validatePlan(json));return;}changePoints(parseBoundaryGeoJson(json));setExclusions([]);setMode("grid");}setFit(n=>n+1);setDrawing(false);setMessage("Área importada. Confira câmera, altura e sobreposição.");
 }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível importar este arquivo.");}}
 useEffect(()=>{
   const params=new URLSearchParams(window.location.search),id=params.get("levantamento");if(!id)return;let active=true;
   queueMicrotask(()=>{if(active)setSurveyChecking(true);});
  const requestedMode=params.get("modo")==="manual"?"manual":params.get("modo")==="grid"?"grid":null;
  getSurveyPlanningContext(id).then(async result=>{
    if(!active)return;if(result.error||!result.context){setSurveyChecking(false);setMessage(result.error||"Levantamento indisponível.");return;}
   const c=result.context,camera=c.config?.camera;
   setRegisteredDrones(c.registered.map(registeredDroneProfile));
   const p:Plan={version:1,name:c.name,mode:requestedMode||(c.planning.drawing.kind==="polygon"?"grid":"manual"),points:c.planning.drawing.points.map(p=>[...p]),settings:{...defaults,...(camera?{diagonalFov:camera.fov,imageWidth:camera.imageWidth,imageHeight:camera.imageHeight}:{})},drone:c.config?.name||c.drone,cameraId:camera?.id||"",photoInterval:Math.min(60,Math.max(3,camera?.minInterval||3)),batteryMinutes:27,captureMode:"manual",captureDistance:12};
    const source:SurveySource={id:c.id,name:c.name,createdAt:c.createdAt};
    load(p,source);setDrawing(true);if(c.planning.center)setCenter([...c.planning.center]);
   setMessage(`Levantamento ${c.name} aberto em ${p.mode==="grid"?"Grid":"Waypoints"}. Desenhe ou ajuste os pontos no mapa.`);
    const latest=await latestMissionVersionForName(source.name,source.createdAt,source.id);
    if(!active)return;
    setSurveyChecking(false);
    if(latest.error)setMessage(`O cadastro foi aberto, mas a conta não pôde ser conferida: ${latest.error}`);
    else if(latest.version){setCloudCandidate(latest.version);setMessage("Há uma revisão salva na conta para este nome. Confira-a antes de continuar com o cadastro do levantamento.");}
    if(!c.planning.center&&c.location.trim().length>=3){try{const response=await fetch(`/api/city-location?q=${encodeURIComponent(c.location)}`);const place=await response.json();if(active&&response.ok&&validPoint([place.lon,place.lat]))setCenter([place.lon,place.lat]);}catch{}}
   }).catch(()=>{if(active){setSurveyChecking(false);setMessage("Não foi possível carregar o levantamento. Tente novamente.");}});
  return()=>{active=false;};
 // The explicit URL selects the initial snapshot once; editing never reimports it.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const filename=name.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,80)||"orion-voo";
 const sliderFields:[keyof Settings,string,string,number,number][]=[["height","Altura planejada","m",1,500],["speed","Velocidade","m/s",0.1,30],["gimbal","Gimbal","°",-90,0]];
 sliderFields.push(["front","Sobreposição frontal","%",0,99]);
 if(["grid","double","oblique"].includes(mode))sliderFields.push(["side","Sobreposição lateral","%",0,99],["bearing","Rumo da grade","°",0,359]);
 function renderFileActions(){return <div className="plan-file-actions" aria-label="Arquivos do plano">
  <label className="import-button">Importar área ou plano<input aria-label="Importar KML, KMZ de área, GeoJSON ou plano Orion JSON" type="file" accept=".json,.geojson,.kml,.kmz" onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file);e.target.value="";}}/></label>
  <button type="button" className="flight-button primary" disabled={cloudBusy||!calculation.legs.length||!!calculation.error||drawingExclusion||!!exclusionDraft.length||(captureMode!=="manual"&&(!takeoffPoint||!homeTransitionClear||(captureMode==="time"&&intervalUnsupported)))} onClick={exportSelectedKmz}>{captureMode==="manual"?"Baixar KMZ de visualização":"Baixar missão KMZ com fotos (experimental)"}</button>
  <label className="import-button">Abrir KMZ para prévia<input aria-label="Abrir KMZ salvo para conferir e simular o arquivo" type="file" accept=".kmz,application/vnd.google-earth.kmz" onChange={e=>{const file=e.target.files?.[0];if(file)void openKmzPreview(file);e.target.value="";}}/></label>
  <label className="import-button">Abrir comprovante RC 2<input aria-label="Abrir receipt.json para comparar com o KMZ lido de volta" type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void openRcReceipt(file);e.target.value="";}}/></label>
  <button type="button" disabled={!calculation.legs.length||!!calculation.error} onClick={()=>download(missionCsv(calculation.legs,settings.height,settings.speed,settings.gimbal),"text/csv;charset=utf-8",`${filename}.csv`)}>CSV dos waypoints</button>
  <button type="button" disabled={!points.length} onClick={exportPlan}>JSON editável</button>
  <InfoPopover title="Arquivos e revisão da rota"><p>Após o download, a Prévia do KMZ lê os bytes gerados e compara waypoints, parâmetros e ações com o plano. Para conferir a cópia gravada no disco, abra esse KMZ pelo seletor acima. O KMZ de visualização não contém missão DJI. Com captura automática, a missão WPML e takePhoto continuam experimentais; aceitação e disparo no Mini 5 Pro não foram comprovados.</p><p>Para conferir uma transferência já realizada, abra o KMZ da pasta readback e o receipt.json da mesma pasta de transferência. A prévia compara SHA-256 e quantidade de pontos; essa conferência de bytes não prova como o DJI Fly desenha ou executa a rota.</p><p>Importar área ou plano aceita KML/KMZ de área, GeoJSON ou JSON Orion. Abrir KMZ para prévia inspeciona uma missão ou visualização sem alterar o plano.</p><p>Antes de usar uma missão no campo, confira o ponto H, altura relativa à decolagem, terreno, obstáculos, bateria e condições legais. O mapa não comanda o drone.</p>{safetyWarnings.length>0&&<ul>{safetyWarnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}</InfoPopover>
  {captureMode!=="manual"&&!takeoffPoint&&<span role="status" className="plan-file-warning">Marque H no mapa para habilitar a missão experimental.</span>}
  {!homeTransitionClear&&<span role="alert" className="plan-file-warning">A ligação entre H e a rota cruza uma área isolada.</span>}
  {captureMode==="time"&&intervalUnsupported&&<span role="alert" className="plan-file-warning">O intervalo escolhido não é compatível com o modo de câmera informado.</span>}
 </div>;}
 function renderModeSelector(){return <div className="mode-selector" role="group" aria-label="Modo de planejamento"><div className="mode-selector-heading"><strong>Modo de voo</strong><Link href="/painel">Abrir levantamentos ↗</Link></div>{([['manual','Waypoints'],['grid','Grid simples'],['double','Grid duplo'],['corridor','Corredor'],['oblique','Oblíquo'],['orbit','Órbita 360°']] as [Mode,string][]).map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} className={mode===value?"selected":""} onClick={()=>{setMode(value);if(value==='oblique')setSettings(s=>({...s,gimbal:-45}));else if(value==='grid'||value==='double')setSettings(s=>({...s,gimbal:-90}));}}>{label}</button>)}{(mode==="grid"||mode==="double")&&<p className="mode-pattern-note">{mode==="grid"?"Grid simples: uma direção de faixas em vai e volta.":"Grid duplo: duas direções de faixas cruzadas."} Desenhe o limite da área sem repetir o ponto 1. O contorno fecha sozinho; o trajeto vai por uma faixa e volta pela faixa vizinha. As ligações entre faixas são retas e não consideram obstáculos nem raio de curva do drone.</p>}</div>;}
 function showGridPreview(){
  if(!polygonMode||!boundaryMeasure||calculation.error||!calculation.legs.length)return;
  setDrawing(false);setDrawingExclusion(false);setMapPanel("area");setFit(n=>n+1);
  setMessage(`Vai e volta gerado automaticamente com ${calculation.legs.filter(leg=>leg.length===2).length} faixas. Confira as viradas, o ponto de decolagem e os obstáculos antes de salvar.`);
 }
 const toggleMapPanel=(panel:NonNullable<typeof mapPanel>)=>setMapPanel(current=>current===panel?null:panel);
 const railTools:MapRailTool[]=[
  {id:"mode",label:"Modo de voo",icon:"▦",pressed:mapPanel==="mode",onClick:()=>toggleMapPanel("mode")},
  {id:"search",label:"Buscar ou importar local",icon:"⌕",pressed:mapPanel==="search",onClick:()=>toggleMapPanel("search")},
  {id:"locate",label:"Minha localização",icon:"⌖",onClick:locateMe,disabled:locating},
  {id:"local",label:"Meu local salvo",icon:"◎",pressed:mapPanel==="local",onClick:()=>toggleMapPanel("local")},
  {id:"position",label:adjustingPosition?"Cancelar ajuste da posição":"Ajustar minha posição",icon:"◉",pressed:adjustingPosition,onClick:()=>{setAdjustingPosition(!adjustingPosition);setMarkingTakeoff(false);setMessage(adjustingPosition?"Ajuste cancelado. Sua posição anterior foi mantida.":"Clique no mapa para indicar sua posição. Esse clique não cria um waypoint.");}},
  {id:"takeoff",label:markingTakeoff?"Cancelar marcação da decolagem":takeoffPoint?"Alterar decolagem":"Marcar decolagem",icon:"H",pressed:markingTakeoff,onClick:()=>{setMarkingTakeoff(!markingTakeoff);setAdjustingPosition(false);setMessage(markingTakeoff?"Marcação da decolagem cancelada.":"Clique no mapa no local real de decolagem. Esse clique não cria um waypoint.");}},
  {id:"points",label:drawing?"Parar de adicionar pontos":"Adicionar pontos",icon:"＋",pressed:drawing,disabled:adjustingPosition||markingTakeoff,onClick:()=>{setExclusionDraft([]);setDrawingExclusion(false);setDrawing(!drawing);}},
  {id:"finish-area",label:mode==="grid"?"Gerar vai e volta":"Concluir área e ver rota",icon:"✓",pressed:mapPanel==="area",disabled:!boundaryMeasure||drawingExclusion||!!calculation.error||!calculation.legs.length,onClick:showGridPreview},
  {id:"altitude",label:`Altura do voo · ${number(settings.height,0)} m`,icon:"↕",pressed:mapPanel==="altitude",onClick:()=>toggleMapPanel("altitude")},
  {id:"terrain",label:"Analisar relevo da rota",icon:"▤",pressed:terrainOpen,onClick:()=>{setTerrainOpen(true);setMapFullscreen(false);requestAnimationFrame(()=>document.getElementById("terrain-flight-planner")?.scrollIntoView({behavior:"smooth",block:"start"}));}},
  {id:"exclusions",label:"Isolar área dentro do contorno",icon:"⊘",pressed:mapPanel==="exclusions",disabled:(!polygonMode||points.length<3)&&!exclusions.length,onClick:()=>{setDrawing(false);setDrawingExclusion(polygonMode);setExclusionError("");setMapPanel("exclusions");setMessage("Marque os pontos da área a isolar. Depois clique em Concluir isolamento no painel.");}},
  {id:"undo",label:drawingExclusion?"Desfazer ponto do isolamento":"Desfazer último ajuste",icon:"↶",disabled:drawingExclusion?!exclusionDraft.length:!history.length,onClick:()=>{if(drawingExclusion)setExclusionDraft(p=>p.slice(0,-1));else{setPoints(history.at(-1)!);setHistory(h=>h.slice(0,-1));}}},
  {id:"clear",label:"Limpar pontos do plano",icon:"×",disabled:!points.length,onClick:()=>{changePoints([]);setExclusions([]);setExclusionDraft([]);setDrawingExclusion(false);}},
  {id:"fit",label:"Enquadrar pontos",icon:"⊞",disabled:!points.length,onClick:()=>setFit(n=>n+1)},
  {id:"measure-area",label:"Medir área no mapa",icon:"▱",divider:true,onClick:()=>{setMapPanel(null);setMeasureAreaRevision(n=>n+1);}},
  {id:"measure-path",label:"Medir distância no mapa",icon:"⌁",onClick:()=>{setMapPanel(null);setMeasurePathRevision(n=>n+1);}},
  {id:"settings",label:"Ajustes da rota",icon:"⚙",pressed:mapPanel==="settings",onClick:()=>toggleMapPanel("settings")},
  {id:"layers",label:"Camada do mapa",icon:"▧",pressed:mapPanel==="layers",onClick:()=>toggleMapPanel("layers")},
  {id:"fullscreen",label:mapFullscreen?"Sair da tela inteira":"Tela inteira",icon:"⛶",pressed:mapFullscreen,onClick:()=>setMapFullscreen(value=>!value)},
  {id:"simulate",label:"Simular voo",icon:"▶",disabled:!calculation.legs.length||!!calculation.error,onClick:()=>{setMapFullscreen(false);setMapPanel(null);setWorkspaceTab("simulation");}},
  {id:"save",label:"Salvar plano",icon:"▣",onClick:()=>void save(),disabled:cloudBusy},
 ];
 const mapPanelTitle=mapPanel==="area"?`Rota automática e área · lateral ${settings.side}%`:mapPanel?({mode:"Modo de voo",search:"Buscar e importar",settings:"Ajustes da rota",altitude:"Altura do voo",layers:"Camada do mapa",local:"Meu local",exclusions:"Áreas isoladas"} as const)[mapPanel]:undefined;
 function renderMapPanel(){
  if(mapPanel==="exclusions")return <div className="map-rail-area"><p>Desenhe dentro do contorno as áreas que não devem receber faixas. A área útil desconta esses recortes. O trajeto inclui desvio nas ligações entre faixas.</p><strong>{boundaryMeasure?`${number(boundaryMeasure.area/10000,2)} ha`:"—"}</strong><span>Área útil · {exclusions.length} isolamento(s)</span>{calculation.error&&<p role="alert" className="camera-warning">Rota não gerada: {calculation.error}</p>}{exclusions.map((ring,i)=><div className="exclusion-list-item" key={i}><span>Área isolada {i+1} · {number(validateBoundary(ring).area,0)} m²</span><button type="button" onClick={()=>{setExclusions(items=>items.filter((_,j)=>j!==i));}}>Remover</button></div>)}{exclusionError&&<p role="alert" className="camera-warning">{exclusionError}</p>}<p>{exclusionDraft.length} ponto(s) no novo isolamento. São necessários pelo menos 3.</p><button type="button" disabled={exclusionDraft.length<3} onClick={finishExclusion}>Concluir isolamento</button><button type="button" onClick={()=>{setExclusionDraft([]);setExclusionError("");setDrawingExclusion(false);setMapPanel(null);}}>Cancelar desenho</button><p>Há uma margem nominal de 5 m ao redor das áreas isoladas no cálculo da rota. Confira relevo, obstáculos, precisão GPS, decolagem e retorno antes de voar.</p></div>;
  if(mapPanel==="area"&&boundaryMeasure)return <div className="map-rail-area"><strong>{number(boundaryMeasure.area/10000,2)} ha</strong><span>{number(boundaryMeasure.area,0)} m² de área útil</span><div className="map-route-summary"><span><b>{calculation.legs.filter(leg=>leg.length===2).length}</b> faixas</span><span><b>{metrics.waypoints}</b> waypoints</span><span><b>{number(metrics.length,0)} m</b> de percurso</span><span><b>{formatFlightTime(metrics.seconds)}</b> de voo estimado</span></div>{mode==="grid"&&<div className="map-pattern-density"><b>Distância entre faixas: {number("spacing" in calculation?calculation.spacing:calculation.gsd?.lineSpacing??0,1)} m</b><small>Mais sobreposição lateral aproxima as faixas e aumenta o tempo de voo.</small><div><button type="button" aria-pressed={settings.side===70} onClick={()=>setField("side","70")}>Padrão · 70%</button><button type="button" aria-pressed={settings.side===85} onClick={()=>setField("side","85")}>Faixas próximas · 85%</button></div></div>}{exclusions.length>0&&<p>Contorno: {number(boundaryMeasure.outerArea,0)} m² · Isolamentos: −{number(boundaryMeasure.excludedArea,0)} m²</p>}<p>A linha amarela mostra o caminho contínuo: vai por uma faixa, vira ao lado e volta pela próxima. As setas indicam o sentido. O contorno fecha automaticamente do último ponto ao primeiro.</p><p>Medida horizontal estimada. Relevo, obstáculos não marcados e raio de curva do drone precisam de conferência no local.</p><button type="button" onClick={()=>{setDrawing(true);setMapPanel(null);}}>Editar pontos do contorno</button></div>;
  if(mapPanel==="mode")return renderModeSelector();
  if(mapPanel==="altitude")return <div className="map-altitude-control"><label htmlFor="map-altitude-number">Altura relativa à decolagem</label><div><input id="map-altitude-number" type="number" min={1} max={500} step={1} value={Number.isFinite(settings.height)?settings.height:""} onChange={e=>setField("height",e.target.value)}/><span>m</span></div><input type="range" aria-label="Ajustar altura do voo no mapa" min={1} max={500} step={1} value={Number.isFinite(settings.height)?settings.height:100} onChange={e=>setField("height",e.target.value)}/><p>Alterar a altura recalcula a distância entre faixas, o GSD e a rota. Confira obstáculos e relevo antes de voar.</p></div>;
  if(mapPanel==="search")return <><form className="map-search" onSubmit={e=>{e.preventDefault();locate();}}><span>⌖</span><input aria-label="Ir para latitude e longitude" placeholder="Latitude, longitude" value={coordinate} onChange={e=>setCoordinate(e.target.value)}/><button>Ir</button></form><GoogleMapsImport maxLatitude={75} onApply={p=>{setImportedLocation(p);setCenter([p.lon,p.lat]);setCoordinate(`${p.lat.toFixed(7)}, ${p.lon.toFixed(7)}`);setAdjustingPosition(false);setMapPanel(null);}}/></>;
  if(mapPanel==="local")return <div className="map-rail-actions"><button type="button" onClick={locateMe} disabled={locating}>⌖ Minha localização</button><button type="button" disabled={!userPosition||userPosition.source!=="manual"} onClick={()=>{if(userPosition)saveMyPlace(userPosition.point);}}>Salvar posição como meu local</button><button type="button" disabled={!points.length} onClick={()=>{if(points[0])saveMyPlace(points[0]);}}>Usar ponto 1 como meu local</button><button type="button" disabled={!myPlace} onClick={()=>{if(myPlace){adjustPosition(myPlace);setCenter([...myPlace]);}}}>Ir ao meu local</button><button type="button" disabled={!myPlace} onClick={forgetMyPlace}>Esquecer local salvo</button><p>Meu local fica apenas neste navegador. Não define o Home do drone.</p></div>;
  if(mapPanel==="layers")return <label className="map-rail-field">Fundo do mapa<select aria-label="Camada do mapa" value={mapBasemap} onChange={e=>setMapBasemap(e.target.value as Basemap)}><option value="satellite">Satélite · Esri</option><option value="streets">Mapa (ruas)</option><option value="topo">Topográfico</option><option value="relief">Relevo</option></select><small>O zoom não aumenta o detalhe original da imagem.</small></label>;
   if(mapPanel==="settings")return <div className="map-rail-settings"><p>Os ajustes de câmera, voo, fotos e bateria ficam agrupados abaixo do mapa. Use os atalhos para chegar à seção desejada.</p><div className="map-settings-links"><a href="#flight-camera" onClick={()=>{setMapFullscreen(false);setMapPanel(null);}}>Câmera</a><a href="#flight-parameters" onClick={()=>{setMapFullscreen(false);setMapPanel(null);}}>Voo</a><a href="#flight-photos" onClick={()=>{setMapFullscreen(false);setMapPanel(null);}}>Fotos</a></div></div>;
  return null;
 }
 const kmzComparison=kmzPreview?((expected)=>expected?compareKmzToPlan(kmzPreview.file,expected):null)(expectedKmz()):null;
 return <div className="flight-app"><aside className="flight-sidebar"><Link className="flight-brand" href="/painel"><span className="orion-symbol" aria-hidden="true">O</span><span>ORION<small>MAPS / PLANEJAMENTO</small><small className="orion-build-label">v{process.env.ORION_APP_VERSION} · {process.env.ORION_BUILD_CHANNEL} · {process.env.ORION_BUILD_REVISION}</small></span></Link><div className="sidebar-label">ÁREA DE TRABALHO</div><nav><Link href="/waypoints" aria-current="page"><span>01</span>Voo e Grid</Link><Link href="/gsd"><span>02</span>Calculadora GSD</Link><Link href="/painel"><span>03</span>Levantamentos</Link><Link href="/processamento"><span>04</span>Processamento</Link></nav><div className="sidebar-bottom"><span className="status-dot"/>PLANEJAMENTO<small>Salvar plano guarda uma cópia no navegador e, com sessão ativa, uma versão na nuvem.</small></div></aside>
 <main className="flight-main"><header className="flight-topbar"><span>MISSÕES / WAYPOINT KMZ</span><Link href="/painel">Voltar ao painel ↗</Link></header><section className="mission-title"><div><div className="eyebrow">DO TERRENO AO TRAJETO</div><h1>Planeje cada passagem.</h1><InfoPopover title="Planejamento de voo"><p>Waypoints e grades de levantamento. Um plano claro, ponto a ponto.</p></InfoPopover></div><div className="title-actions"><button onClick={openCloud} disabled={cloudBusy} className="flight-button">Histórico na nuvem</button><button onClick={openSaved} className="flight-button">Planos neste navegador</button><div className="title-primary-actions"><button onClick={()=>void save()} disabled={cloudBusy} className="flight-button primary">{cloudBusy?"Salvando…":"Salvar plano ↗"}</button><RcTransfer plan={plan} legs={calculation.legs} captureLegs={calculation.captureLegs} disabled={transferDisabled}/></div></div></section>
 {renderFileActions()}
 {kmzPreviewError&&<div role="alert" className="flight-message">{kmzPreviewError}<button type="button" aria-label="Fechar erro do KMZ" onClick={()=>setKmzPreviewError("")}>×</button></div>}
  {saveFeedback&&<div className={`flight-save-feedback${mapFullscreen?" flight-save-feedback--fullscreen":""} flight-save-feedback--${saveFeedback.fingerprint===JSON.stringify(plan)?saveFeedback.level:"warning"}`} role="status" aria-live="polite">{saveFeedback.fingerprint===JSON.stringify(plan)?saveFeedback.text:"Há alterações depois do último salvamento. Clique em Salvar plano novamente."}</div>}
  {surveyChecking&&<div className="flight-save-feedback flight-save-feedback--warning" role="status">Conferindo as revisões desta conta antes de permitir outro salvamento.</div>}
  {cloudCandidate&&<section className="flight-save-feedback flight-save-feedback--warning survey-revision-notice" role="alert"><strong>Existe uma revisão na conta com o mesmo nome.</strong><p>Editor atual: {points.length} pontos desenhados. Revisão {cloudCandidate.id} de {new Date(cloudCandidate.created_at).toLocaleString("pt-BR")}: {Array.isArray((cloudCandidate.plan as {points?:unknown})?.points)?(cloudCandidate.plan as {points:unknown[]}).points.length:"?"} pontos desenhados. Estes números não são os waypoints calculados. O nome sozinho não prova que seja o mesmo levantamento; confira antes de substituir o plano em tela.</p><div><button type="button" disabled={cloudBusy} onClick={()=>void recoverVersion(cloudCandidate.id,true)}>Abrir revisão da conta</button><button type="button" onClick={()=>{setBaseVersionId(cloudCandidate.id);setCloudCandidate(null);setMessage("O cadastro antigo foi mantido no editor. Salvar criará outra revisão na conta sem apagar as anteriores.");}}>Continuar com cadastro atual</button></div></section>}
  <nav className="flight-workspace-tabs" role="tablist" aria-label="Área de trabalho do voo"><button type="button" role="tab" id="planning-tab" aria-controls="planning-panel" aria-selected={workspaceTab==="planning"} onClick={()=>{setWorkspaceTab("planning");requestAnimationFrame(()=>window.dispatchEvent(new Event("resize")));}}>Planejamento</button><button type="button" role="tab" id="simulation-tab" aria-controls="simulation-panel" aria-selected={workspaceTab==="simulation"} disabled={!kmzPreview&&(!calculation.legs.length||!!calculation.error)} title={!kmzPreview&&!calculation.legs.length?"Desenhe ou importe uma rota para simular":"Visualizar o arquivo ou percurso sem enviar comandos ao drone"} onClick={()=>setWorkspaceTab("simulation")}>{kmzPreview?"Prévia do KMZ":"Simular voo"}</button></nav>
 {workspaceTab==="simulation"&&<div id="simulation-panel" role="tabpanel" aria-labelledby="simulation-tab">{kmzPreview?<KmzFileSimulator key={kmzPreview.id} file={kmzPreview.file} label={kmzPreview.label} sha256={kmzPreview.sha256} receipt={rcReceipt} comparison={kmzComparison} hasPlan={!!calculation.legs.length&&!calculation.error} planTakeoff={takeoffPoint} onClose={()=>{setKmzPreview(null);if(!calculation.legs.length||calculation.error)setWorkspaceTab("planning");}}/>:<FlightSimulator name={name} drone={drone} legs={calculation.legs} boundary={["grid","double","oblique"].includes(mode)?points:[]} height={settings.height} speed={settings.speed} gimbal={settings.gimbal} captureMode={captureMode} photoInterval={photoInterval} captureDistance={captureDistance} batteryMinutes={batteryMinutes} batteryFullMinutes={batteryFullMinutes} captureLegs={calculation.captureLegs} takeoffPoint={takeoffPoint} userPosition={userPosition?.point||null}/>}</div>}
 {workspaceTab==="planning"&&!calculation.legs.length&&<InfoPopover title="Planejamento de voo"><p className="mission-note">Desenhe ou importe uma rota no planejamento para habilitar a aba Simular voo. Não é necessário ter fotos processadas.</p></InfoPopover>}
  <div id="planning-panel" role="tabpanel" aria-labelledby="planning-tab" hidden={workspaceTab!=="planning"}>
 <div className="mission-metrics">{[["WAYPOINTS",calculation.error?"—":metrics.waypoints,""],["DISTÂNCIA TOTAL",calculation.error?"—":number(metrics.length,0),"m"],["TEMPO ESTIMADO",calculation.error?"—":formatFlightTime(metrics.seconds),""],["BATERIAS · SEM RETORNO",calculation.error?"—":metrics.batteries,`${number(batteryMinutes,1)} min úteis`],["FOTOS ESTIMADAS",calculation.error?"—":`~${photoCount}`,photoBasis],["ÁREA",calculation.area?number(calculation.area/10000,2):"—","ha"],["ALTURA",Number.isFinite(settings.height)?settings.height:"—","m"],["VELOCIDADE",Number.isFinite(settings.speed)?number(settings.speed):"—","m/s"]].map(([label,value,unit])=><div key={label}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>)}</div>
 <InfoPopover title="Planejamento de voo"><p className="mission-note">{points.length} {mode==="manual"?"pontos desenhados":mode==="orbit"?"pontos de centro e raio":mode==="corridor"?"pontos do eixo":"vértices no contorno"} · {calculation.photos.length} posições de foto por sobreposição. Distância inclui conexões entre faixas; tempo = distância ÷ velocidade. Fotos pelo intervalo selecionado consideram disparo contínuo no percurso; são uma estimativa, não comandos enviados ao drone. Baterias usam a autonomia útil informada abaixo.</p></InfoPopover>
 {message&&<div role="status" className="flight-message">{message}<button aria-label="Fechar aviso" onClick={()=>setMessage("")}>×</button></div>}
 {calculation.error&&<div role="alert" className="flight-message"><span><b>Rota ainda não gerada. </b>{calculation.error} Você pode salvar o rascunho e corrigir os pontos depois.</span></div>}
 {versions!==null&&<section className="saved-plans"><div><h2>Histórico na nuvem · últimas 100 versões</h2><button onClick={()=>setVersions(null)}>Fechar</button></div>{versions.length?versions.map(v=><div key={v.id}><strong>{v.name}</strong><small>Revisão {v.id}</small><p>{new Date(v.created_at).toLocaleString("pt-BR")} · {v.kind==="preview"?"Revisão — não enviada ao RC 2":v.kind==="device_backup"?"Backup do controle":"WPML não validado"}</p><button disabled={cloudBusy} onClick={()=>recoverVersion(v.id,false)}>Baixar cópia</button>{v.kind==="preview"&&<button disabled={cloudBusy} onClick={()=>recoverVersion(v.id,true)}>Abrir esta versão no editor</button>}</div>):<p>Nenhuma versão arquivada.</p>}</section>}
 {saved!==null&&<section className="saved-plans"><div><h2>Meus planos · neste navegador</h2><button onClick={()=>setSaved(null)}>Fechar</button></div>{saved.length?saved.map((p,i)=><button key={i} onClick={()=>load(p)}>{p.name}<small>{i===0?"Mais recente · ":""}{p.points.length} pontos · {p.mode} · lateral {p.settings.side}%</small><span>Abrir ↗</span></button>):<p>Nenhum plano salvo. Salve um plano ou importe um JSON Orion.</p>}</section>}
 <div className="mission-layout"><section className={`map-workspace${mapFullscreen?" map-workspace--fullscreen":""}`} aria-label="Mapa e ferramentas do voo"><div className="map-view-actions"><div><strong>Mapa do voo{mode==="grid"?" · Grid simples":mode==="double"?" · Grid duplo":""}</strong><span>{polygonMode?"Marque apenas o contorno externo em ordem. O último ponto liga-se ao primeiro automaticamente.":"Use a barra de ícones à esquerda do mapa para desenhar, medir, ajustar e simular."}</span></div>{polygonMode&&<button type="button" className="flight-button primary" disabled={!boundaryMeasure||!!calculation.error||drawingExclusion||!calculation.legs.length} onClick={showGridPreview}>{mode==="grid"?"Gerar vai e volta":"Gerar grade"} ↗</button>}</div>
 {takeoffPoint&&<div className="takeoff-summary"><b>H · Decolagem marcada</b><span>{takeoffPoint[1].toFixed(6)}, {takeoffPoint[0].toFixed(6)}{fullMissionMetrics?` · ida + rota + volta: ${number(fullMissionMetrics.length,0)} m · ${formatFlightTime(fullMissionMetrics.seconds)} · ${fullMissionMetrics.batteries} bateria(s) estimada(s)`:""}</span><button type="button" onClick={()=>{setTakeoffPoint(null);setMessage("Ponto de decolagem removido. A rota foi mantida.");}}>Remover</button></div>}
 <PlanningCanvas importedLocation={importedLocation} adjustingPosition={adjustingPosition} onPositionPick={adjustPosition} markingTakeoff={markingTakeoff} takeoffPoint={takeoffPoint} onTakeoffPick={p=>{if(!validPoint(p))return;setTakeoffPoint(p);setMarkingTakeoff(false);setMessage("Decolagem marcada. Confira o local, a altura relativa, relevo e obstáculos; salve o plano novamente.");}} userPosition={userPosition} points={points} exclusions={exclusions} exclusionDraft={exclusionDraft} drawingExclusion={drawingExclusion} onExclusionAdd={p=>{if(exclusionDraft.length>=100){setMessage("Limite de 100 pontos por área isolada.");return;}if(validPoint(p)){setExclusionError("");setExclusionDraft(current=>[...current,p]);}}} legs={calculation.legs} polygon={polygonMode} drawing={drawing} center={center} fit={fit} basemap={mapBasemap} measureAreaRevision={measureAreaRevision} measurePathRevision={measurePathRevision} onMeasurementActiveChange={setMeasuring} onAdd={p=>{if(points.length>=200){setMessage("Limite de 200 pontos por plano.");return;}if(validPoint(p)){if(points.some(existing=>distance(existing,p)<1)){setMessage("Já existe um ponto neste local. Arraste o marcador para ajustá-lo.");return;}changePoints([...points,p]);}}} onMove={(i,p)=>{if(validPoint(p))changePoints(points.map((v,j)=>i===j?p:v));}} tools={<><MapToolRail tools={railTools.map(tool=>tool.id==="measure-area"?{...tool,pressed:measuring&&measureAreaRevision>measurePathRevision}:tool.id==="measure-path"?{...tool,pressed:measuring&&measurePathRevision>=measureAreaRevision}:tool)} panelTitle={mapPanelTitle} onClose={()=>setMapPanel(null)}>{renderMapPanel()}</MapToolRail>{!drawing&&boundaryMeasure&&mapPanel!=="area"&&<div className="map-area-badge" role="status"><span>Área delimitada</span><strong>{number(boundaryMeasure.area/10000,2)} ha</strong><small>{number(boundaryMeasure.area,0)} m²</small></div>}</>}/>
 {terrainOpen&&<TerrainFlightPlanner route={terrainRoute} home={takeoffPoint} height={settings.height} onClose={()=>setTerrainOpen(false)}/>}
 <InfoPopover title="Desenho do percurso"><div className="map-instruction"><b>{mode==="manual"?"01 / TRACE O PERCURSO":mode==="orbit"?"01 / CENTRO E RAIO":mode==="corridor"?"01 / EIXO DO CORREDOR":"01 / CONTORNE A ÁREA"}</b><span>{mode==="manual"?"Clique na sequência do percurso; arraste os pontos para ajustar.":mode==="orbit"?"Clique no centro da órbita e depois em um ponto que define o raio.":mode==="corridor"?"Marque os pontos do eixo do corredor, na ordem do trajeto.":"Clique apenas no contorno da área, em ordem, sem cruzar as bordas. Não preencha o interior: as passagens serão geradas automaticamente."}</span></div></InfoPopover>
 <details className="point-table"><summary>{polygonMode?"Vértices da área":"Coordenadas dos waypoints"} <span>{points.length} {polygonMode?"vértices":"pontos"}</span></summary><div><table><thead><tr><th>{polygonMode?"Vértice":"Waypoint"}</th><th>Latitude</th><th>Longitude</th><th/></tr></thead><tbody>{points.map((p,i)=><tr key={i}><td>{polygonMode?`V${i+1}`:String(i+1).padStart(2,"0")}</td><td>{p[1].toFixed(6)}</td><td>{p[0].toFixed(6)}</td><td><button aria-label={`Remover ${polygonMode?"vértice":"waypoint"} ${i+1}`} onClick={()=>changePoints(points.filter((_,j)=>i!==j))}>Remover</button></td></tr>)}</tbody></table></div></details><InfoPopover title="Planejamento de voo"><p className="mission-note">Estimativa sobre terreno plano. O tempo inclui conexões entre faixas, mas não considera desacelerações nas curvas, decolagem ou retorno. Informe a autonomia útil já descontando sua reserva de bateria. A altura ainda não considera o relevo. O mapa inicia com uma visão do Brasil; localize ou importe sua área para planejar.</p></InfoPopover></section>
  <aside className="mission-controls"><div className="flight-settings-heading"><strong>Configurações do levantamento</strong><span>Ajuste a câmera, o voo e a captura de fotos.</span></div>
  <div className="mission-control-columns">
   <div className="mission-control-column">
 <section id="flight-camera" className="control-section"><div className="section-heading"><span>01</span><h2>Missão & câmera</h2></div><label>Nome da missão<input maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label>Modelo do drone<select value={selectedDrone?drone:"custom"} onChange={e=>{const profile=availableDrones.find(p=>p.name===e.target.value);setDrone(profile?.name||"");if(profile)applyCamera(profile.cameras[0]);else customCamera();}}><option value="custom">Personalizado / selecionar modelo</option>{availableDrones.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select></label>
 {!selectedDrone&&<label>Nome do drone<input maxLength={100} value={drone} onChange={e=>setDrone(e.target.value)} placeholder="Informe o modelo"/></label>}
 <label>Câmera e modo de foto<select value={selectedCamera?.id||"custom"} onChange={e=>{const camera=selectedDrone?.cameras.find(c=>c.id===e.target.value);if(camera)applyCamera(camera);else customCamera();}}><option value="custom">Parâmetros personalizados</option>{selectedDrone?.cameras.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
 <InfoPopover title="Especificações e cobertura">{selectedCamera?<><dl><div><dt>Sensor</dt><dd>{selectedCamera.sensor}</dd></div><div><dt>Focal equivalente</dt><dd>{selectedCamera.equivalentFocal} mm</dd></div><div><dt>Campo de visão</dt><dd>{number(selectedCamera.fov)}°</dd></div><div><dt>Foto</dt><dd>{settings.imageWidth} × {settings.imageHeight} px{selectedCamera.estimatedResolution?" · estimada":""}</dd></div></dl><p>GSD estimado pelo campo de visão diagonal, em terreno plano e câmera para baixo. {selectedCamera.estimatedResolution&&"Resolução reduzida estimada a partir do modo máximo; confira as dimensões da sua foto."}</p><p>{selectedCamera.minInterval===null?"O fabricante não lista disparo temporizado neste modo de resolução.":`Intervalo mínimo de foto temporizada: ${selectedCamera.minInterval} s.`} {selectedDrone?.note}</p></>:<><p>Preencha os dados da câmera. Dimensões físicas e focal real são diferentes da focal equivalente.</p><div className="camera-fields">{(settings.diagonalFov!==undefined?[["diagonalFov","FOV diagonal · °"],["imageWidth","Largura foto · px"],["imageHeight","Altura foto · px"]]:[['sensorWidth','Largura sensor · mm'],['sensorHeight','Altura sensor · mm'],['focal','Focal real · mm'],['imageWidth','Largura foto · px'],['imageHeight','Altura foto · px']] as [keyof Settings,string][]).map(([key,label])=><label key={key}>{label}<input type="number" min="0.01" step="any" value={Number.isFinite(settings[key as keyof Settings])?settings[key as keyof Settings]:""} onChange={e=>setField(key as keyof Settings,e.target.value)}/></label>)}</div></>}
 {calculation.gsd&&<dl><div><dt>GSD / nadir</dt><dd>{number(calculation.gsd.gsdX,2)} cm/px</dd></div><div><dt>Cobertura por foto</dt><dd>{number(calculation.gsd.footprintWidth)} × {number(calculation.gsd.footprintHeight)} m</dd></div></dl>}{selectedDrone?.source&&<a href={selectedDrone.source} target="_blank" rel="noreferrer">Fonte do fabricante ↗</a>}</InfoPopover></section>
 <section id="flight-photos" className="control-section"><div className="section-heading"><span>03</span><h2>Captura de fotos</h2></div><label>Início automático das fotos<select aria-label="Modo de captura automática" value={captureMode} onChange={e=>{setCaptureMode(e.target.value as CaptureMode);}}><option value="manual">Manual no DJI Fly</option><option value="time">Automático por tempo</option><option value="distance">Automático por distância</option></select></label>{captureMode==='distance'&&<label>Distância entre fotos · metros<input type="number" min={1} max={500} step="0.5" value={captureDistance} onChange={e=>{setCaptureDistance(Number(e.target.value));}}/></label>}<InfoPopover title="Planejamento de voo"><p className="muted">Cada faixa de captura recebe uma ação experimental takePhoto por tempo ou distância, do primeiro ao último waypoint da faixa. Ligações, desvios e ida ou retorno à base ficam fora dos grupos. O perímetro adicional entra na captura quando ativado. A aceitação pelo Mini 5 Pro depende do DJI Fly e não foi comprovada. Não aciona fotos pelo site.</p></InfoPopover><label>Intervalo entre fotos · segundos<input type="number" min={1} max={60} step={1} value={photoInterval} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=1&&v<=60){setPhotoInterval(v);}}}/></label>
 {calculation.gsd&&settings.gimbal===-90?<><InfoPopover title="Planejamento de voo"><p>Velocidade máxima calculada para {number(settings.front)}% de sobreposição: <b>{number(recommendedSpeed)} m/s</b>. Distância entre fotos na velocidade atual: {number(settings.speed*photoInterval)} m.</p></InfoPopover><button className="flight-button" disabled={recommendedSpeed<0.1||intervalUnsupported} onClick={()=>setSettings(s=>({...s,speed:recommendedSpeed}))}>Aplicar velocidade calculada</button>{settings.speed>calculation.gsd.photoSpacing/photoInterval&&<p role="status" className="camera-warning">A velocidade atual reduz a sobreposição abaixo do valor escolhido. Diminua a velocidade ou o intervalo.</p>}{recommendedSpeed<0.1&&<p className="camera-warning">A velocidade necessária está abaixo do limite do editor. Revise altura, intervalo e sobreposição.</p>}</>:<InfoPopover title="Planejamento de voo"><p>O cálculo de velocidade exige câmera para baixo (−90°) e parâmetros válidos.</p></InfoPopover>}
 {intervalUnsupported&&<p role="status" className="camera-warning">Este intervalo não é compatível com o limite de foto temporizada informado para o modo de câmera selecionado. Confira o controle e escolha outro intervalo ou modo.</p>}
 <InfoPopover title="Planejamento de voo"><p className="muted">Estimativa em terreno plano, com o lado menor da foto na direção do voo. Confirme a orientação da câmera. No modo manual, configure o intervalo no DJI Fly. Nos modos automáticos, o Orion exporta um KMZ experimental separado, ainda sem validação no controle.</p></InfoPopover></section>
   </div>
   <div className="mission-control-column">
 {mode==='corridor'&&<section className="control-section"><label>Largura do corredor · metros<input type="number" min={5} max={500} value={corridorWidth} onChange={e=>{setCorridorWidth(Number(e.target.value));}}/></label><InfoPopover title="Planejamento de voo"><p>Marque o eixo do corredor no mapa. As faixas paralelas serão geradas automaticamente.</p></InfoPopover></section>}
 {mode==='orbit'&&<section className="control-section"><label>Posições na órbita<input type="number" min={12} max={180} value={orbitSamples} onChange={e=>{setOrbitSamples(Number(e.target.value));}}/></label><InfoPopover title="Planejamento de voo"><p>Marque o centro e depois um ponto no raio. A órbita é uma única volta em altitude constante; não é uma trajetória 3D multinível.</p></InfoPopover></section>}
 {polygonMode&&<section className="control-section"><label className="perimeter-pass-option"><input type="checkbox" checked={perimeterPass} onChange={e=>{setPerimeterPass(e.target.checked);}}/> Acrescentar uma passagem pelo perímetro após as faixas</label><p className="muted">A rota percorre o contorno salvo uma vez para reforçar as bordas. A área delimitada não muda; confira obstáculos e cobertura real. Esta opção não garante eliminar falhas.</p></section>}
 <section id="flight-parameters" className="control-section"><div className="section-heading"><span>02</span><h2>Parâmetros do voo</h2></div>{sliderFields.map(([key,label,unit,min,max])=><label className="slider-control" key={key}><span>{label}<span><input aria-label={label} type="number" min={min} max={max} step="any" value={Number.isFinite(settings[key])?settings[key]:""} onChange={e=>setField(key,e.target.value)}/>{unit}</span></span><input aria-label={`${label} controle deslizante`} type="range" min={min} max={max} step={key==='speed'?0.1:1} value={Number.isFinite(settings[key])?settings[key]:min} onChange={e=>setField(key,e.target.value)}/></label>)}{calculation.gsd&&<div className="gsd-readout"><span>GSD previsto / nadir</span><b>{number(calculation.gsd.gsdX,2)} cm/px</b><small>Disparo a cada {number(calculation.gsd.interval,2)} s para a sobreposição informada</small></div>}{selectedCamera&&calculation.gsd&&selectedCamera.minInterval!==null&&calculation.gsd.interval<selectedCamera.minInterval&&<p role="status" className="camera-warning">O plano exige disparos mais rápidos que o intervalo listado para esta câmera. Reduza a velocidade ou escolha outro modo de foto.</p>}</section>
 <section className="control-section"><label>Autonomia total estimada por bateria · min<input type="number" min={1} max={180} step={0.5} value={batteryFullMinutes} onChange={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=1&&value<=180){setBatteryFullMinutes(value);}}}/></label><p className="battery-reserve-note">Reserva planejada: <b>15%</b> · tempo útil para ida, captura e retorno: <b>{number(batteryMinutes,1)} min</b>.</p><InfoPopover title="Reserva de bateria"><p>A autonomia informada é uma hipótese sua, não uma leitura do drone. A prévia reserva 15% na chegada à base e antecipa o retorno conforme a distância. Vento, temperatura, relevo, estado da bateria e o retorno inteligente da DJI podem exigir retorno antes. O Orion não altera o limite de bateria nem comanda o RTH.</p></InfoPopover></section>
   </div>
  </div>
 </aside></div></div><footer className="flight-footer"><span>ORION MAPS · PLANEJAMENTO DE CAMPO</span><span>WGS84 / COORDENADAS GEOGRÁFICAS</span></footer></main></div>;
}






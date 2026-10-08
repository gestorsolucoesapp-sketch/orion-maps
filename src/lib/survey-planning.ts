import {validateMeasureDrawing,measureDrawing,type MeasureDrawing,type MeasurePoint} from "./map-measurement";
import {droneProfiles,type CameraProfile,type DroneProfile} from "./drone-cameras";
export type SurveyBasemap="streets"|"satellite"|"topo";
export type SurveyPlanning={version:1;center:MeasurePoint|null;zoom:number;basemap:SurveyBasemap;cityQuery:string;drawing:MeasureDrawing};
export type CustomDroneProfile={id:string;name:string;camera:CameraProfile;source:string;features:string;created_at?:string};
export type SurveyDroneConfig={version:1;name:string;camera:CameraProfile|null;custom_id:string|null;source:string;features:string};
export const SUGGESTED_DRONE="DJI Mini 5 Pro";
export const EMPTY_SURVEY_PLANNING:SurveyPlanning={version:1,center:null,zoom:4,basemap:"streets",cityQuery:"",drawing:{kind:"polygon",points:[]}};
export const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown,max:number,label:string,min=0)=>{if(typeof v!=="string"||v.trim().length<min||v.trim().length>max)throw Error(`Revise ${label}.`);return v.trim();};
const numeric=(v:unknown,min:number,max:number,label:string,integer=false)=>{if(typeof v!=="number"||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))throw Error(`Revise ${label}.`);return v;};
export function validateSurveyPlanning(v:unknown):SurveyPlanning{
 if(!v||typeof v!=="object"||(v as {version?:unknown}).version!==1)throw Error("Mapa do levantamento inválido.");
 const p=v as Record<string,unknown>;
 if(!["streets","satellite","topo"].includes(String(p.basemap)))throw Error("Camada do mapa inválida.");
 const center=p.center===null?null:validateMeasureDrawing({kind:"path",points:[p.center]}).points[0];
 const drawing=validateMeasureDrawing(p.drawing),metrics=measureDrawing(drawing);if(metrics.issue)throw Error(metrics.issue);
 return {version:1,center,zoom:numeric(p.zoom,0,22,"o zoom"),basemap:p.basemap as SurveyBasemap,cityQuery:text(p.cityQuery,200,"a cidade"),drawing};
}
export function validateCustomDrone(v:unknown):CustomDroneProfile{
 if(!v||typeof v!=="object")throw Error("Cadastro de drone inválido.");const p=v as Record<string,unknown>,c=p.camera as Record<string,unknown>|undefined;
 if(!uuid(p.id)||!c)throw Error("Cadastro de drone inválido.");
 const name=text(p.name,100,"o nome do drone",2);
 if(droneProfiles.some(d=>d.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error("Esse modelo já está no catálogo. Selecione-o na lista.");
 const source=text(p.source,500,"a fonte");if(source){const url=new URL(source);if(url.protocol!=="https:"||url.username||url.password)throw Error("A fonte deve ser um endereço HTTPS.");}
 return {id:p.id,name,source,features:text(p.features,1000,"os recursos"),camera:{id:"custom-main",label:text(c.label,100,"a câmera",2),sensor:text(c.sensor,100,"o sensor",2),fov:numeric(c.fov,1,179,"o campo de visão"),equivalentFocal:numeric(c.equivalentFocal,1,2000,"a focal equivalente"),imageWidth:numeric(c.imageWidth,64,30000,"a largura da foto",true),imageHeight:numeric(c.imageHeight,64,30000,"a altura da foto",true),estimatedResolution:false,minInterval:c.minInterval===null?null:numeric(c.minInterval,.1,120,"o intervalo mínimo")}};
}
export function registeredDroneProfile(p:CustomDroneProfile):DroneProfile{return {name:p.name,source:p.source,cameras:[p.camera],note:p.features||"Dados informados no cadastro particular."};}
export function catalogueConfig(name:string,cameraId?:string):SurveyDroneConfig|null{
 const drone=droneProfiles.find(d=>d.name.toLocaleLowerCase()===name.toLocaleLowerCase());if(!drone)return null;
 const camera=drone.cameras.find(c=>c.id===cameraId)||drone.cameras[0];
 return {version:1,name:drone.name,camera:{...camera},custom_id:null,source:drone.source,features:drone.note||""};
}
export function customConfig(p:CustomDroneProfile):SurveyDroneConfig{return {version:1,name:p.name,camera:{...p.camera},custom_id:p.id,source:p.source,features:p.features};}
export function validateStoredConfig(v:unknown):SurveyDroneConfig|null{
 if(v===null||v===undefined)return null;if(!v||typeof v!=="object")throw Error("Perfil do levantamento inválido.");
 const p=v as SurveyDroneConfig;if(p.version!==1)throw Error("Versão do perfil inválida.");
 const name=text(p.name,100,"o drone");
 if(p.custom_id)return customConfig(validateCustomDrone({id:p.custom_id,name,camera:p.camera,source:p.source,features:p.features}));
 const found=catalogueConfig(name,p.camera?.id);if(found)return found;
 if(p.camera!==null)throw Error("Selecione um perfil cadastrado.");
 return {version:1,name,camera:null,custom_id:null,source:"",features:""};
}

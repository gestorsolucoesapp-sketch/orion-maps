export type CameraProfile = {
  id:string; label:string; sensor:string; equivalentFocal:number; fov:number;
  imageWidth:number; imageHeight:number; estimatedResolution:boolean;
  minInterval:number|null;
};
export type DroneProfile = { name:string; source:string; cameras:CameraProfile[]; note?:string };
// FOV is used as a diagonal field of view for planning, without inventing physical sensor dimensions.
// Reduced-resolution dimensions assume 2x2 binning of the published maximum photo dimensions.
function lens(id:string,label:string,sensor:string,equivalentFocal:number,fov:number,width:number,height:number,modes:[string,number,number|null][]):CameraProfile[]{
 return modes.map(([mp,scale,minInterval])=>({id:`${id}-${mp}`,label:`${label} ${equivalentFocal} mm · ${mp} MP`,sensor,equivalentFocal,fov,imageWidth:width/scale,imageHeight:height/scale,estimatedResolution:scale!==1,minInterval}));
}
const wide48=()=>lens('wide','Grande-angular','1/1.3″ CMOS',24,82,8064,6048,[['12',2,2],['48',1,5]]);
const wide50=()=>lens('wide','Grande-angular','1″ CMOS',24,84,8192,6144,[['12',2,2],['50',1,5]]);
const tele48=(minimum=5)=>lens('medium','Tele média','1/1.3″ CMOS',70,35,8064,6048,[['12',2,2],['48',1,minimum]]);
const hasselblad20=()=>lens('main','Hasselblad','4/3″ CMOS',24,84,5280,3956,[['20',1,2]]);
export const droneProfiles:DroneProfile[]=[
 {name:'DJI Air 3',source:'https://www.dji.com/air-3/specs',cameras:[...wide48(),...tele48()]},
 {name:'DJI Air 3S',source:'https://www.dji.com/air-3s/specs',cameras:[...wide50(),...tele48()]},
 {name:'DJI Mini 5 Pro',source:'https://www.dji.com/mini-5-pro/specs',cameras:wide50()},
 {name:'DJI Mavic 3',source:'https://www.dji.com/mavic-3/downloads',cameras:[...hasselblad20(),...lens('tele','Tele','1/2″ CMOS',162,15,4000,3000,[['12',1,2]])]},
 {name:'DJI Mavic 3 Classic',source:'https://www.dji.com/mavic-3-classic/specs',cameras:hasselblad20()},
 {name:'DJI Mavic 3 Pro',source:'https://www.dji.com/mavic-3-pro/specs',cameras:[...hasselblad20(),...tele48(7),...lens('tele','Tele','1/2″ CMOS',166,15,4000,3000,[['12',1,2]])]},
 {name:'DJI Mavic 4 Pro',source:'https://www.dji.com/mavic-4-pro/specs',cameras:[...lens('main','Hasselblad','4/3″ CMOS',28,72,12288,8192,[['25',2,2],['100',1,10]]),...tele48(),...lens('tele','Tele','1/1.5″ CMOS',168,15,8192,6144,[['12.5',2,2],['50',1,5]])],note:'Intervalos conservadores da versão padrão. A versão 512 GB pode permitir intervalos menores.'},
 {name:'DJI Mini 4 Pro',source:'https://www.dji.com/mini-4-pro/specs',cameras:lens('wide','Grande-angular','1/1.3″ CMOS',24,82.1,8064,6048,[['12',2,2],['48',1,5]])},
 {name:'DJI Lito X1',source:'https://www.dji.com/lito-x1/specs',cameras:lens('wide','Grande-angular','1/1.3″ CMOS',24,82.1,8064,6048,[['12',2,2],['48',1,null]])},
 {name:'Potensic Atom 2',source:'https://ae01.alicdn.com/kf/Se273c12e6f3c430c86ca983b643d9213N.pdf',cameras:lens('wide','Grande-angular','1/2″ CMOS',26,79.4,8000,6000,[['12',2,2],['48',1,null]]),note:'Manual Potensic ATOM 2 V08, pp. 18 e 53. Disparo temporizado listado apenas para 12 MP JPG.'},
];
export function findCamera(drone:string,id?:string){return droneProfiles.find(p=>p.name===drone)?.cameras.find(c=>c.id===id);}

export type AlignmentCoord=[number,number];
export type AlignmentPair={id:string;source:AlignmentCoord};
const radius=6378137;
function project([lon,lat]:AlignmentCoord):AlignmentCoord{
 const clamped=Math.max(-85,Math.min(85,lat));
 return [radius*lon*Math.PI/180,radius*Math.log(Math.tan(Math.PI/4+clamped*Math.PI/360))];
}
function unproject([x,y]:AlignmentCoord):AlignmentCoord{
 return [x/radius*180/Math.PI,(2*Math.atan(Math.exp(y/radius))-Math.PI/2)*180/Math.PI];
}
export function dragTranslation(from:AlignmentCoord,to:AlignmentCoord):AlignmentCoord{
 const a=project(from),b=project(to);
 return [b[0]-a[0],b[1]-a[1]];
}
export function translateCorners(corners:AlignmentCoord[],offset:AlignmentCoord):AlignmentCoord[]{
 if(!offset[0]&&!offset[1])return corners;
 return corners.map(c=>{const p=project(c);return unproject([p[0]+offset[0],p[1]+offset[1]]);});
}
export function alignedCorners(corners:AlignmentCoord[],pairs:AlignmentPair[],references:{id:string;point:AlignmentCoord}[]):AlignmentCoord[]{
 const matched=pairs.map(pair=>({source:project(pair.source),target:references.find(ref=>ref.id===pair.id)?.point})).filter((pair):pair is {source:AlignmentCoord;target:AlignmentCoord}=>!!pair.target).map(pair=>({source:pair.source,target:project(pair.target)}));
 if(!matched.length)return corners;
 if(matched.length===1){const a=matched[0];const dx=a.target[0]-a.source[0],dy=a.target[1]-a.source[1];return corners.map(c=>{const p=project(c);return unproject([p[0]+dx,p[1]+dy]);});}
 const [a,b]=matched;
 const sx=b.source[0]-a.source[0],sy=b.source[1]-a.source[1],tx=b.target[0]-a.target[0],ty=b.target[1]-a.target[1];
 const sourceLength=Math.hypot(sx,sy),targetLength=Math.hypot(tx,ty);
 if(sourceLength<5||targetLength<5)throw Error("Escolha cruzes separadas por pelo menos 5 m.");
 const scale=targetLength/sourceLength;
 if(scale<0.8||scale>1.2)throw Error("A escala mudou mais de 20%. Revise as correspondências.");
 const angle=Math.atan2(ty,tx)-Math.atan2(sy,sx);
 if(Math.abs(angle)>Math.PI/6)throw Error("A rotação ultrapassa 30°. Revise as correspondências.");
 const cos=Math.cos(angle)*scale,sin=Math.sin(angle)*scale;
 return corners.map(c=>{const p=project(c),x=p[0]-a.source[0],y=p[1]-a.source[1];return unproject([a.target[0]+x*cos-y*sin,a.target[1]+x*sin+y*cos]);});
}

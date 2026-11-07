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
export function transformPreviewPoint(source:AlignmentCoord,original:AlignmentCoord[],transformed:AlignmentCoord[]):AlignmentCoord{
 if(original.length!==4||transformed.length!==4)throw Error("Limites da ortofoto inválidos.");
 const point=project(source),northWest=project(original[0]),northEast=project(original[1]),southWest=project(original[3]);
 const width=northEast[0]-northWest[0],height=southWest[1]-northWest[1];
 if(!width||!height)throw Error("Limites da ortofoto inválidos.");
 const u=(point[0]-northWest[0])/width,v=(point[1]-northWest[1])/height;
 const corners=transformed.map(project),nw=corners[0],ne=corners[1],se=corners[2],sw=corners[3];
 return unproject([
  nw[0]*(1-u)*(1-v)+ne[0]*u*(1-v)+se[0]*u*v+sw[0]*(1-u)*v,
  nw[1]*(1-u)*(1-v)+ne[1]*u*(1-v)+se[1]*u*v+sw[1]*(1-u)*v,
 ]);
}
export function inverseTransformPreviewPoint(display:AlignmentCoord,original:AlignmentCoord[],transformed:AlignmentCoord[]):AlignmentCoord{
 if(original.length!==4||transformed.length!==4)throw Error("Limites da ortofoto inválidos.");
 const point=project(display),nw=project(transformed[0]),ne=project(transformed[1]),sw=project(transformed[3]);
 const ux=ne[0]-nw[0],uy=ne[1]-nw[1],vx=sw[0]-nw[0],vy=sw[1]-nw[1];
 const determinant=ux*vy-uy*vx;
 if(Math.abs(determinant)<1)throw Error("Limites da ortofoto inválidos.");
 const dx=point[0]-nw[0],dy=point[1]-nw[1];
 const u=(dx*vy-dy*vx)/determinant,v=(ux*dy-uy*dx)/determinant;
 const sourceNw=project(original[0]),sourceNe=project(original[1]),sourceSw=project(original[3]);
 return unproject([sourceNw[0]+u*(sourceNe[0]-sourceNw[0])+v*(sourceSw[0]-sourceNw[0]),sourceNw[1]+u*(sourceNe[1]-sourceNw[1])+v*(sourceSw[1]-sourceNw[1])]);
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

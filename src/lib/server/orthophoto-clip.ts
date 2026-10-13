import sharp from "sharp";
import {clipPixelGeometry,clipWorldFile,validateClipSpec,type ClipBounds} from "@/lib/orthophoto-clip";

export type ClippedOrthophoto={png:Buffer;width:number;height:number;bounds:ClipBounds;worldFile:string;coverageLimited:boolean};

function maskSvg(geometry:ReturnType<typeof clipPixelGeometry>,width:number,height:number):Buffer{
  const sx=width/geometry.width,sy=height/geometry.height;
  // The polygon and its round stroke are rendered in WGS84 tangent-plane metres.
  // Stroke width 2 * margin makes the exterior buffer exactly margin metres.
  const transform=`matrix(${sx*geometry.xPerM} 0 0 ${sy*geometry.yPerM} ${-geometry.left*sx} ${-geometry.top*sy})`;
  const points=geometry.points.map(([x,y])=>`${x/geometry.xPerM},${y/geometry.yPerM}`).join(" ");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="${transform}"><polygon points="${points}" fill="white" stroke="white" stroke-width="${2*geometry.effectiveMarginM}" stroke-linejoin="round" stroke-linecap="round"/></g></svg>`);
}

/** Produces new PNG bytes. The source never enters the output outside the cutline. */
export async function renderOrthophotoClip(input:Buffer,bounds:ClipBounds,rawSpec:unknown,mode:"preview"|"download"):Promise<ClippedOrthophoto>{
  const spec=validateClipSpec(rawSpec);
  const metadata=await sharp(input,{limitInputPixels:160000000}).metadata();
  if(!metadata.width||!metadata.height||!["png","jpeg","webp"].includes(metadata.format||""))throw new Error("A entrega privada exige uma ortofoto PNG, JPEG ou WebP com limites geográficos.");
  const geometry=clipPixelGeometry(spec,bounds,metadata.width,metadata.height);
  if(mode==="download"&&geometry.width*geometry.height>60000000)throw new Error("O recorte excede o limite de exportação PNG. O original continua privado; use um recorte menor.");
  const scale=mode==="preview"?Math.min(1,2400/Math.max(geometry.width,geometry.height)):1;
  const width=Math.max(1,Math.round(geometry.width*scale)),height=Math.max(1,Math.round(geometry.height*scale));
  const mask=maskSvg(geometry,width,height);
  const pipeline=sharp(input,{limitInputPixels:160000000,sequentialRead:true})
    .extract({left:geometry.left,top:geometry.top,width:geometry.width,height:geometry.height});
  if(scale<1)pipeline.resize(width,height,{fit:"fill"});
  const png=await pipeline.ensureAlpha().composite([{input:mask,blend:"dest-in"}]).png({compressionLevel:6}).toBuffer();
  return {png,width,height,bounds:geometry.bounds,worldFile:clipWorldFile(geometry.bounds,width,height),coverageLimited:geometry.coverageLimited};
}

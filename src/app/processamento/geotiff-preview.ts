import proj4 from "proj4";
import {assertTerrainGrid,type TerrainGrid} from "@/lib/terrain-analysis";
import {slopePercentAt, terrainColor, validRange, validSample, type TerrainPalette} from "@/lib/terrain-preview";

export type RasterCorners = [[number,number],[number,number],[number,number],[number,number]];
type TiffImage = {
  getWidth:()=>number; getHeight:()=>number;
  getGDALNoData:()=>number|string|null|undefined;
  getBoundingBox:()=>number[];
  getOrigin:()=>number[];getResolution:()=>number[];
  getFileDirectory:()=>{ModelTransformation?:number[]};
  getGeoKeys?:()=>Record<string,number>;
  geoKeys?:Record<string,number>;
  readRasters:(options:{samples:number[]})=>Promise<ArrayLike<ArrayLike<number>>>;
};
type GeoTiffModule = {fromUrl:(url:string)=>Promise<{getImage:()=>Promise<TiffImage>}>;fromBlob:(blob:Blob)=>Promise<{getImage:()=>Promise<TiffImage>}>};
type SourceRaster = TerrainGrid & {corners:RasterCorners;min:number;max:number;analysisCompatible:boolean};
const sources = new Map<string,Promise<SourceRaster>>();

function projection(code:number):string {
  if (code===4326 || code===3857) return `EPSG:${code}`;
  if (code>=32601 && code<=32660) return `+proj=utm +zone=${code-32600} +datum=WGS84 +units=m +no_defs`;
  if (code>=32701 && code<=32760) return `+proj=utm +zone=${code-32700} +south +datum=WGS84 +units=m +no_defs`;
  const known=proj4.defs(`EPSG:${code}`);
  if (known) return `EPSG:${code}`;
  throw new Error(`Projeção EPSG:${code} não suportada nesta prévia. O GeoTIFF original permanece disponível.`);
}
const importer=new Function("u","return import(u)") as (url:string)=>Promise<GeoTiffModule>;
async function sourceFromImage(image:TiffImage):Promise<SourceRaster> {
    const width=image.getWidth(),height=image.getHeight();
    if(width*height>16000000)throw new Error("GeoTIFF excede o limite desta prévia no navegador. Use o arquivo técnico original.");
    const keys=image.getGeoKeys?.()||image.geoKeys||{};
    const code=Number(keys.ProjectedCSTypeGeoKey||keys.GeographicTypeGeoKey);
    if(!Number.isFinite(code))throw new Error("GeoTIFF sem projeção identificada. Não é possível posicionar a prévia com segurança.");
    const crs=projection(code),[west,south,east,north]=image.getBoundingBox();
    const origin=image.getOrigin(),resolution=image.getResolution(),transform=image.getFileDirectory().ModelTransformation;
    const analysisCompatible=resolution[0]>0&&resolution[1]<0&&(!transform||(transform[1]===0&&transform[4]===0))&&code!==3857&&(!keys.VerticalUnitsGeoKey||keys.VerticalUnitsGeoKey===9001);
    const corners=[[west,north],[east,north],[east,south],[west,south]].map(p=>proj4(crs,"EPSG:4326",p)) as RasterCorners;
    if(!corners.every(p=>p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90))throw new Error("Limites geográficos inválidos no GeoTIFF.");
    // Read native samples. Interpolating NoData (-9999) with elevations corrupts the colour range.
    const rasters=await image.readRasters({samples:[0]});
    const band=rasters[0],raw=image.getGDALNoData(),noData=raw==null?null:Number(raw);
    const {min,max}=validRange(band,noData);
    return {band,width,height,noData,corners,west:origin[0],north:origin[1],crs,sourceCrs:`EPSG:${code}`,analysisCompatible,dx:Math.abs(east-west)/width,dy:Math.abs(north-south)/height,metric:code!==4326&&(keys.ProjLinearUnitsGeoKey===9001||(code>=32601&&code<=32760)),min,max};
}
async function readSource(url:string):Promise<SourceRaster> {
  const existing=sources.get(url);if(existing)return existing;
  const task=(async()=>{
    const {fromUrl}=await importer("https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm");
    const image=await (await fromUrl(url)).getImage();
    return sourceFromImage(image);
  })();
  sources.set(url,task);
  while(sources.size>2)sources.delete(sources.keys().next().value!);
  task.catch(()=>{if(sources.get(url)===task)sources.delete(url);});
  return task;
}

/** Display-only preview of existing files. No writes, uploads or processing-job changes. */
export async function renderGeoTiffToDataUrl(url:string,palette:TerrainPalette) {
  const source=await readSource(url);
  if(palette==="slope"&&!source.metric)throw new Error("A prévia de declividade precisa de um DTM com unidades horizontais em metros.");
  const scale=Math.min(1,1200/Math.max(source.width,source.height));
  const width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
  const values=new Float64Array(width*height);values.fill(NaN);
  for(let y=0;y<height;y++) {
    const sy=Math.min(source.height-1,Math.floor((y+.5)*source.height/height));
    for(let x=0;x<width;x++) {
      const sx=Math.min(source.width-1,Math.floor((x+.5)*source.width/width));
      const v=palette==="slope"?slopePercentAt(source.band,source.width,source.height,sx,sy,source.dx,source.dy,source.noData):Number(source.band[sy*source.width+sx]);
      if(validSample(v,source.noData))values[y*width+x]=v;
    }
    if(y%80===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  const range=palette==="slope"?validRange(values,null):{min:source.min,max:source.max};
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas indisponível.");
  const imageData=ctx.createImageData(width,height);
  for(let i=0;i<values.length;i++) {
    const v=values[i];if(!Number.isFinite(v))continue;
    const [r,g,b]=terrainColor(v,range.min,range.max,palette),o=i*4;
    imageData.data[o]=r;imageData.data[o+1]=g;imageData.data[o+2]=b;imageData.data[o+3]=255;
  }
  ctx.putImageData(imageData,0,0);
  return {url:canvas.toDataURL("image/png"),...range,width,height,corners:source.corners,sourceResolutionM:source.metric?[source.dx,source.dy]:null};
}

/** Shared, lazy, authenticated source already used by the colour layer; never mutates stored products. */
export async function loadTerrainModel(url:string):Promise<TerrainGrid>{
  const source=await readSource(url);
  if(!source.analysisCompatible)throw new Error("A leitura pontual requer DTM com grade norte-acima e unidades métricas, sem rotação ou distorção Web Mercator.");
  assertTerrainGrid(source);return source;
}

/** Local DTM stays in the browser; no upload or temporary public URL is required. */
export async function loadTerrainModelFromBlob(blob:Blob):Promise<TerrainGrid>{
  const {fromBlob}=await importer("https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm");
  const source=await sourceFromImage(await (await fromBlob(blob)).getImage());
  if(!source.analysisCompatible)throw new Error("A análise da rota exige DTM com grade norte-acima e unidades métricas, sem rotação ou distorção Web Mercator.");
  assertTerrainGrid(source);return source;
}

type Palette="dtm"|"dsm";

type GeoTiffModule={
  fromUrl:(url:string)=>Promise<{
    getImage:()=>Promise<{
      getWidth:()=>number;
      getHeight:()=>number;
      getGDALNoData:()=>number|string|null|undefined;
      readRasters:(options:{width:number;height:number;resampleMethod:string})=>Promise<ArrayLike<ArrayLike<number>>>;
    }>;
  }>;
};

function ramp(t:number,palette:Palette):[number,number,number]{
  const x=Math.max(0,Math.min(1,t));
  if(palette==="dsm"){
    if(x<0.25)return [36,99+Math.round(x*260),171+Math.round(x*200)];
    if(x<0.5)return [34+Math.round((x-.25)*520),164+Math.round((x-.25)*180),154-Math.round((x-.25)*220)];
    if(x<0.75)return [164+Math.round((x-.5)*300),209-Math.round((x-.5)*300),80-Math.round((x-.5)*160)];
    return [239,134-Math.round((x-.75)*260),91+Math.round((x-.75)*340)];
  }
  if(x<0.2)return [33,112+Math.round(x*180),63];
  if(x<0.4)return [58+Math.round((x-.2)*400),148+Math.round((x-.2)*270),73];
  if(x<0.6)return [138+Math.round((x-.4)*390),202-Math.round((x-.4)*120),78];
  if(x<0.8)return [216+Math.round((x-.6)*100),178-Math.round((x-.6)*210),73-Math.round((x-.6)*70)];
  return [236-Math.round((x-.8)*250),136-Math.round((x-.8)*170),72-Math.round((x-.8)*80)];
}

async function loadGeoTiff():Promise<GeoTiffModule>{
  const importer=new Function("u","return import(u)") as (url:string)=>Promise<GeoTiffModule>;
  return importer("https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm");
}

export async function renderGeoTiffToDataUrl(url:string,palette:Palette){
  const {fromUrl}=await loadGeoTiff();
  const tiff=await fromUrl(url);
  const image=await tiff.getImage();
  const sourceW=image.getWidth(),sourceH=image.getHeight();
  const maxSide=1200;
  const scale=Math.min(1,maxSide/Math.max(sourceW,sourceH));
  const width=Math.max(1,Math.round(sourceW*scale)),height=Math.max(1,Math.round(sourceH*scale));
  const rasters=await image.readRasters({width,height,resampleMethod:"bilinear"});
  const band=rasters[0];
  const noDataRaw=image.getGDALNoData();
  const noData=noDataRaw==null?null:Number(noDataRaw);

  let min=Infinity,max=-Infinity;
  for(let i=0;i<band.length;i++){
    const v=Number(band[i]);
    if(!Number.isFinite(v)||(noData!==null&&Math.abs(v-noData)<1e-6)||v<-9000)continue;
    if(v<min)min=v;if(v>max)max=v;
  }
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min)throw new Error("GeoTIFF sem valores válidos.");

  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas indisponível.");
  const imageData=ctx.createImageData(width,height);
  for(let i=0;i<band.length;i++){
    const v=Number(band[i]),o=i*4;
    if(!Number.isFinite(v)||(noData!==null&&Math.abs(v-noData)<1e-6)||v<-9000){imageData.data[o+3]=0;continue;}
    const [r,g,b]=ramp((v-min)/(max-min),palette);
    imageData.data[o]=r;imageData.data[o+1]=g;imageData.data[o+2]=b;imageData.data[o+3]=235;
  }
  ctx.putImageData(imageData,0,0);
  return {url:canvas.toDataURL("image/png"),min,max,width,height};
}

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

function mix(a:[number,number,number],b:[number,number,number],t:number):[number,number,number]{
  const x=Math.max(0,Math.min(1,t));
  return [Math.round(a[0]+(b[0]-a[0])*x),Math.round(a[1]+(b[1]-a[1])*x),Math.round(a[2]+(b[2]-a[2])*x)];
}

function ramp(t:number,palette:Palette):[number,number,number]{
  const x=Math.max(0,Math.min(1,t));
  const stops:([number,number,number])[]=palette==="dtm"
    ? [[34,94,57],[104,158,76],[194,194,86],[220,149,72],[132,80,55]]
    : [[44,95,160],[58,151,176],[91,168,120],[215,190,82],[182,82,64]];
  const scaled=x*(stops.length-1),i=Math.min(stops.length-2,Math.floor(scaled));
  return mix(stops[i],stops[i+1],scaled-i);
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

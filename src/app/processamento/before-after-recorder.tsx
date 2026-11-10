"use client";

import {useEffect,useRef,useState} from "react";

type Props={
  getMapCanvas:()=>HTMLCanvasElement|null;
  projectName:string;
  oldDate:string;
  flightDate:string;
  onRecordingChange?:(recording:boolean)=>void;
};

const WIDTH=720,HEIGHT=1280,FRAME_MS=50,MAX_MS=20_000;

function fitText(ctx:CanvasRenderingContext2D,value:string,maxWidth:number){
  if(ctx.measureText(value).width<=maxWidth)return value;
  let text=value;
  while(text.length>1&&ctx.measureText(text+"…").width>maxWidth)text=text.slice(0,-1);
  return text+"…";
}

function wrapText(ctx:CanvasRenderingContext2D,value:string,maxWidth:number){
  const lines:string[]=[],words=value.split(/\s+/);
  let line="";
  for(const word of words){
    const next=line?`${line} ${word}`:word;
    if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);
  return lines;
}

function videoMime(){
  if(typeof MediaRecorder==="undefined")return null;
  for(const type of ["video/mp4;codecs=avc1.42E01E","video/mp4","video/webm;codecs=vp9","video/webm"]){
    if(MediaRecorder.isTypeSupported(type))return type;
  }
  return null;
}

export default function BeforeAfterRecorder({getMapCanvas,projectName,oldDate,flightDate,onRecordingChange}:Props){
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),frame=useRef<number|null>(null),timer=useRef<number|null>(null),ticker=useRef<number|null>(null),started=useRef(0),lastFrame=useRef(0),url=useRef<string|null>(null);
  const [recording,setRecording]=useState(false),[elapsed,setElapsed]=useState(0),[blob,setBlob]=useState<Blob|null>(null),[previewUrl,setPreviewUrl]=useState<string|null>(null),[message,setMessage]=useState("");

  useEffect(()=>()=>{
    if(frame.current!==null)window.clearInterval(frame.current);
    if(timer.current!==null)window.clearTimeout(timer.current);
    if(ticker.current!==null)window.clearInterval(ticker.current);
    if(recorder.current?.state==="recording")recorder.current.stop();
    stream.current?.getTracks().forEach(track=>track.stop());
    if(url.current)URL.revokeObjectURL(url.current);
  },[]);

  function stop(){
    if(recorder.current?.state==="recording")recorder.current.stop();
  }

  function start(){
    setMessage("");
    const source=getMapCanvas(),mime=videoMime();
    if(!source||!mime){setMessage("Este navegador não consegue gravar o mapa. Abra no Safari atualizado ou use a gravação de tela do celular.");return;}
    const output=document.createElement("canvas");output.width=WIDTH;output.height=HEIGHT;
    const ctx=output.getContext("2d",{alpha:false});
    if(!ctx||typeof output.captureStream!=="function"){setMessage("A gravação de vídeo não está disponível neste navegador.");return;}
    const draw=(time:number)=>{
      if(time-lastFrame.current>=FRAME_MS){
        lastFrame.current=time;
        ctx.fillStyle="#08251f";ctx.fillRect(0,0,WIDTH,HEIGHT);
        ctx.fillStyle="#e7f4e8";ctx.font="bold 25px Arial, sans-serif";ctx.fillText("ORION MAPS",32,58);
        ctx.font="bold 35px Arial, sans-serif";ctx.fillText(fitText(ctx,projectName,WIDTH-64),32,111);
        ctx.fillStyle="#b3dcc3";ctx.font="bold 21px Arial, sans-serif";ctx.fillText("ANTES  /  DEPOIS",32,156);

        const size=WIDTH-48,mapY=200;
        ctx.fillStyle="#17362f";ctx.fillRect(24,mapY,size,size);
        const scale=Math.max(size/source.width,size/source.height);
        const drawWidth=source.width*scale,drawHeight=source.height*scale;
        ctx.save();ctx.beginPath();ctx.rect(24,mapY,size,size);ctx.clip();
        ctx.drawImage(source,24+(size-drawWidth)/2,mapY+(size-drawHeight)/2,drawWidth,drawHeight);
        ctx.restore();

        ctx.fillStyle="#ecf9eb";ctx.font="bold 24px Arial, sans-serif";
        ctx.fillText(fitText(ctx,oldDate,WIDTH-64),32,940);
        ctx.fillText(fitText(ctx,flightDate,WIDTH-64),32,980);
        ctx.fillStyle="#b9d2c3";ctx.font="17px Arial, sans-serif";
        const credit=source.closest(".maplibregl-map")?.querySelector(".maplibregl-ctrl-attrib-inner")?.textContent?.trim()||"Imagem: © Esri, Vantor, Earthstar Geographics, GIS User Community";
        wrapText(ctx,credit,WIDTH-64).slice(0,4).forEach((line,index)=>ctx.fillText(line,32,1045+index*23));
        ctx.fillStyle="#86bb9e";ctx.font="18px Arial, sans-serif";
        ctx.fillText("Comparação visual · Orion Maps",32,1195);
      }
    };
    try{
      draw(performance.now());
      // Reading one pixel confirms that external map tiles did not taint the recording canvas.
      ctx.getImageData(0,0,1,1);
      const capture=output.captureStream(20);
      const media=new MediaRecorder(capture,{mimeType:mime,videoBitsPerSecond:3_000_000});
      const chunks:BlobPart[]=[];
      media.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      media.onerror=()=>setMessage("A gravação foi interrompida pelo navegador. Tente novamente em Safari.");
      media.onstop=()=>{
        if(frame.current!==null)window.clearInterval(frame.current);frame.current=null;
        if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;
        if(ticker.current!==null)window.clearInterval(ticker.current);ticker.current=null;
        capture.getTracks().forEach(track=>track.stop());stream.current=null;recorder.current=null;
        setRecording(false);onRecordingChange?.(false);
        const video=new Blob(chunks,{type:media.mimeType||mime});
        if(video.size){
          if(url.current)URL.revokeObjectURL(url.current);
          url.current=URL.createObjectURL(video);setBlob(video);setPreviewUrl(url.current);
          setMessage("Vídeo pronto. Confira a prévia e toque em Compartilhar ou Baixar.");
        }else setMessage("O navegador não produziu vídeo. Use Safari atualizado ou a gravação de tela do celular.");
      };
      if(url.current){URL.revokeObjectURL(url.current);url.current=null;}
      setBlob(null);setPreviewUrl(null);setElapsed(0);started.current=Date.now();
      stream.current=capture;recorder.current=media;
      media.start(1000);setRecording(true);onRecordingChange?.(true);
      frame.current=window.setInterval(()=>draw(performance.now()),FRAME_MS);
      ticker.current=window.setInterval(()=>setElapsed(Math.min(20,Math.floor((Date.now()-started.current)/1000))),250);
      timer.current=window.setTimeout(stop,MAX_MS);
    }catch(error){
      if(frame.current!==null)window.clearInterval(frame.current);frame.current=null;
      stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
      setMessage(error instanceof Error?`Não foi possível gravar: ${error.message}`:"Não foi possível gravar este mapa.");
    }
  }

  function file(){
    if(!blob)return null;
    const ext=blob.type.includes("mp4")?"mp4":"webm";
    return new File([blob],`orion-maps-antes-depois.${ext}`,{type:blob.type||`video/${ext}`});
  }
  async function share(){
    const item=file();if(!item)return;
    if(!navigator.share||!navigator.canShare?.({files:[item]})){setMessage("Este navegador não compartilha vídeos diretamente. Use Baixar vídeo.");return;}
    try{await navigator.share({files:[item],title:"Orion Maps · Antes e Depois"});}
    catch(error){if((error as Error).name!=="AbortError")setMessage("Não foi possível compartilhar. Tente Baixar vídeo.");}
  }
  function download(){
    const item=file();if(!item||!url.current)return;
    const link=document.createElement("a");link.href=url.current;link.download=item.name;
    document.body.appendChild(link);link.click();link.remove();
  }
  function discard(){
    if(url.current){URL.revokeObjectURL(url.current);url.current=null;}
    setBlob(null);setPreviewUrl(null);
    setMessage("Gravação excluída desta página. Vídeos já salvos no aparelho permanecem disponíveis.");
  }

  return <section aria-label="Gravar comparação antes e depois" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
    <p className="font-semibold">Vídeo do antes e depois</p>
    <p className="mt-1 text-xs">Coloque a barra em “Antes”, toque em Gravar, mova a barra com o dedo e toque em Parar. Máximo de 20 segundos. O vídeo inclui as datas e os créditos da imagem.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {!recording?<button type="button" onClick={start} className="rounded-lg bg-emerald-900 px-4 py-2 font-semibold text-white">● Gravar transição</button>:<button type="button" onClick={stop} className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white">■ Parar · {elapsed}s</button>}
      {blob&&!recording&&<><button type="button" onClick={()=>void share()} className="rounded-lg border border-emerald-700 bg-white px-4 py-2 font-semibold">Compartilhar vídeo</button><button type="button" onClick={download} className="rounded-lg border border-emerald-700 bg-white px-4 py-2 font-semibold">Baixar vídeo</button><button type="button" onClick={discard} className="rounded-lg border border-red-300 bg-white px-4 py-2 font-semibold text-red-800">Excluir vídeo</button></>}
    </div>
    {previewUrl&&blob&&!recording&&<video src={previewUrl} controls playsInline className="mt-3 max-h-72 w-auto max-w-full rounded-lg bg-black" aria-label="Prévia do vídeo gravado"/>}
    {message&&<p role="status" className="mt-2 text-xs">{message}</p>}
  </section>;
}

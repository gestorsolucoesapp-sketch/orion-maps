"use client";

import {useEffect,useRef,useState} from "react";

type Props={url:string};

export default function PointCloudViewer({url}:Props){
  const host=useRef<HTMLDivElement>(null);
  const [status,setStatus]=useState("Carregando nuvem 3D…");
  const [count,setCount]=useState(0);

  useEffect(()=>{
    if(!host.current)return;
    let disposed=false,frame=0;
    const el=host.current;
    let renderer:{domElement:HTMLCanvasElement;setPixelRatio:(v:number)=>void;setSize:(w:number,h:number,updateStyle?:boolean)=>void;render:(s:unknown,c:unknown)=>void;dispose:()=>void}|null=null;
    let controls:{enableDamping:boolean;dampingFactor:number;target:{set:(x:number,y:number,z:number)=>void};update:()=>void;dispose:()=>void}|null=null;
    let resizeObserver:ResizeObserver|null=null;

    async function start(){
      try{
        const importer=new Function("u","return import(u)") as (url:string)=>Promise<Record<string,unknown>>;
        const [threeMod,controlsMod,coreMod,lasMod]=await Promise.all([
          importer("https://cdn.jsdelivr.net/npm/three@0.180.0/+esm"),
          importer("https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js/+esm"),
          importer("https://cdn.jsdelivr.net/npm/@loaders.gl/core@4.3.4/+esm"),
          importer("https://cdn.jsdelivr.net/npm/@loaders.gl/las@4.3.4/+esm"),
        ]);
        if(disposed)return;

        const THREE=threeMod as Record<string,new (...args:unknown[])=>unknown> & Record<string,unknown>;
        const OrbitControls=controlsMod.OrbitControls as new (camera:unknown,dom:HTMLElement)=>typeof controls;
        const load=coreMod.load as (url:string,loader:unknown,options:Record<string,unknown>)=>Promise<{attributes?:Record<string,{value?:ArrayLike<number>;size?:number}>}>;
        const LASLoader=lasMod.LASLoader;

        const SceneCtor=THREE.Scene as new()=>{background:unknown;add:(o:unknown)=>void;traverse:(cb:(o:unknown)=>void)=>void};
        const ColorCtor=THREE.Color as new(v:number)=>unknown;
        const CameraCtor=THREE.PerspectiveCamera as new(a:number,b:number,c:number,d:number)=>{aspect:number;near:number;far:number;position:{set:(x:number,y:number,z:number)=>void};updateProjectionMatrix:()=>void};
        const RendererCtor=THREE.WebGLRenderer as new(o:Record<string,unknown>)=>typeof renderer;
        const GeometryCtor=THREE.BufferGeometry as new()=>{setAttribute:(name:string,a:unknown)=>void;computeBoundingSphere:()=>void;boundingSphere?:{radius:number};dispose:()=>void};
        const AttributeCtor=THREE.BufferAttribute as new(a:Float32Array,size:number)=>unknown;
        const MaterialCtor=THREE.PointsMaterial as new(o:Record<string,unknown>)=>{dispose:()=>void};
        const PointsCtor=THREE.Points as new(g:unknown,m:unknown)=>unknown;

        const scene=new SceneCtor();
        scene.background=new ColorCtor(0x0f1719);
        const camera=new CameraCtor(48,1,0.1,100000);
        renderer=new RendererCtor({antialias:true,preserveDrawingBuffer:true});
        if(!renderer)throw new Error("WebGL indisponível.");
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        el.innerHTML="";el.appendChild(renderer.domElement);
        controls=new OrbitControls(camera,renderer.domElement);
        if(!controls)throw new Error("Controles 3D indisponíveis.");
        controls.enableDamping=true;controls.dampingFactor=.08;

        function resize(){
          if(disposed||!renderer)return;
          const w=Math.max(1,el.clientWidth),h=Math.max(320,el.clientHeight);
          renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
        }
        resizeObserver=new ResizeObserver(resize);resizeObserver.observe(el);resize();

        const data=await load(url,LASLoader,{worker:false,las:{shape:"mesh",skip:3,fp64:false,colorDepth:"auto"}});
        if(disposed)return;
        const attrs=data?.attributes||{};
        const posAccessor=attrs.POSITION||attrs.positions;
        const colorAccessor=attrs.COLOR_0||attrs.colors;
        const source=posAccessor?.value;
        if(!source||source.length<3)throw new Error("Nuvem sem posições 3D.");

        const n=Math.floor(source.length/3);
        const positions=new Float32Array(n*3);
        let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
        for(let i=0;i<n;i++){
          const x=Number(source[i*3]),y=Number(source[i*3+1]),z=Number(source[i*3+2]);
          if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
        }
        const cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2;
        const colors=new Float32Array(n*3);
        const colorSource=colorAccessor?.value;
        const colorSize=Number(colorAccessor?.size||3);
        const zRange=Math.max(1,maxZ-minZ);
        for(let i=0;i<n;i++){
          const x=Number(source[i*3])-cx,y=Number(source[i*3+1])-cy,z=Number(source[i*3+2])-cz;
          positions[i*3]=x;positions[i*3+1]=z;positions[i*3+2]=-y;
          if(colorSource&&colorSource.length>=n*colorSize){
            colors[i*3]=Math.min(1,Number(colorSource[i*colorSize])/255);
            colors[i*3+1]=Math.min(1,Number(colorSource[i*colorSize+1])/255);
            colors[i*3+2]=Math.min(1,Number(colorSource[i*colorSize+2])/255);
          }else{
            const t=(Number(source[i*3+2])-minZ)/zRange;
            colors[i*3]=0.15+0.65*t;colors[i*3+1]=0.55+0.35*(1-Math.abs(t-.5)*2);colors[i*3+2]=0.28+0.5*(1-t);
          }
        }

        const geometry=new GeometryCtor();
        geometry.setAttribute("position",new AttributeCtor(positions,3));
        geometry.setAttribute("color",new AttributeCtor(colors,3));
        geometry.computeBoundingSphere();
        const radius=Math.max(10,geometry.boundingSphere?.radius||100);
        const material=new MaterialCtor({size:Math.max(.08,radius/550),vertexColors:true,sizeAttenuation:true});
        const points=new PointsCtor(geometry,material);scene.add(points);

        camera.position.set(radius*1.2,radius*.9,radius*1.2);
        camera.near=Math.max(.01,radius/10000);camera.far=radius*30;camera.updateProjectionMatrix();
        controls.target.set(0,0,0);controls.update();
        setCount(n);setStatus("Arraste para girar · pinça/roda para zoom");

        function animate(){
          if(disposed||!renderer||!controls)return;
          controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(animate);
        }
        animate();
      }catch(error){
        setStatus(error instanceof Error?error.message:"Não foi possível abrir a nuvem 3D.");
      }
    }
    void start();

    return()=>{
      disposed=true;cancelAnimationFrame(frame);resizeObserver?.disconnect();controls?.dispose();renderer?.dispose();
      if(renderer?.domElement.parentElement===el)el.removeChild(renderer.domElement);
    };
  },[url]);

  return <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-[#0f1719]">
    <div ref={host} className="h-[58vh] min-h-[420px] max-h-[700px] w-full"/>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/25 px-4 py-3 text-xs text-white/75">
      <span>{status}</span><span>{count?count.toLocaleString("pt-BR")+" pontos exibidos":""}</span>
    </div>
  </div>;
}

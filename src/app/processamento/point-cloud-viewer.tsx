"use client";

import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {load} from "@loaders.gl/core";
import {LASLoader} from "@loaders.gl/las";

type Props={url:string};

export default function PointCloudViewer({url}:Props){
  const host=useRef<HTMLDivElement>(null);
  const [status,setStatus]=useState("Carregando nuvem 3D…");
  const [count,setCount]=useState(0);

  useEffect(()=>{
    if(!host.current)return;
    let disposed=false,frame=0;
    const el=host.current;
    const scene=new THREE.Scene();
    scene.background=new THREE.Color(0x0f1719);
    const camera=new THREE.PerspectiveCamera(48,1,0.1,100000);
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    el.innerHTML="";
    el.appendChild(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;
    controls.dampingFactor=.08;

    function resize(){
      if(disposed)return;
      const w=Math.max(1,el.clientWidth),h=Math.max(320,el.clientHeight);
      renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    }
    const ro=new ResizeObserver(resize);ro.observe(el);resize();

    async function start(){
      try{
        const data:any=await load(url,LASLoader,{worker:false,las:{shape:"mesh",skip:3,fp64:false,colorDepth:"auto"}});
        if(disposed)return;
        const attrs=data?.attributes||{};
        const posAccessor=attrs.POSITION||attrs.positions;
        const colorAccessor=attrs.COLOR_0||attrs.colors;
        const source=posAccessor?.value as ArrayLike<number>|undefined;
        if(!source||source.length<3)throw new Error("Nuvem sem posições 3D.");

        const n=Math.floor(source.length/3);
        const positions=new Float32Array(n*3);
        let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
        for(let i=0;i<n;i++){
          const x=Number(source[i*3]),y=Number(source[i*3+1]),z=Number(source[i*3+2]);
          if(x<minX)minX=x;if(x>maxX)maxX=x;
          if(y<minY)minY=y;if(y>maxY)maxY=y;
          if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
        }
        const cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2;
        const colors=new Float32Array(n*3);
        const colorSource=colorAccessor?.value as ArrayLike<number>|undefined;
        const colorSize=Number(colorAccessor?.size||3);
        const zRange=Math.max(1,maxZ-minZ);
        for(let i=0;i<n;i++){
          const x=Number(source[i*3])-cx,y=Number(source[i*3+1])-cy,z=Number(source[i*3+2])-cz;
          positions[i*3]=x;positions[i*3+1]=z;positions[i*3+2]=-y;
          if(colorSource&&colorSource.length>=n*colorSize){
            const divisor=(colorSource instanceof Uint16Array)?65535:255;
            colors[i*3]=Number(colorSource[i*colorSize])/divisor;
            colors[i*3+1]=Number(colorSource[i*colorSize+1])/divisor;
            colors[i*3+2]=Number(colorSource[i*colorSize+2])/divisor;
          }else{
            const t=(Number(source[i*3+2])-minZ)/zRange;
            colors[i*3]=0.15+0.65*t;
            colors[i*3+1]=0.55+0.35*(1-Math.abs(t-.5)*2);
            colors[i*3+2]=0.28+0.5*(1-t);
          }
        }

        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
        geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
        geometry.computeBoundingSphere();
        const radius=Math.max(10,geometry.boundingSphere?.radius||100);
        const material=new THREE.PointsMaterial({size:Math.max(.08,radius/550),vertexColors:true,sizeAttenuation:true});
        const points=new THREE.Points(geometry,material);
        scene.add(points);

        camera.position.set(radius*1.2,radius*.9,radius*1.2);
        camera.near=Math.max(.01,radius/10000);camera.far=radius*30;camera.updateProjectionMatrix();
        controls.target.set(0,0,0);controls.update();
        setCount(n);setStatus("Arraste para girar · pinça/roda para zoom");

        function animate(){
          if(disposed)return;
          controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(animate);
        }
        animate();
      }catch(error){
        setStatus(error instanceof Error?error.message:"Não foi possível abrir a nuvem 3D.");
      }
    }
    void start();

    return()=>{
      disposed=true;cancelAnimationFrame(frame);ro.disconnect();controls.dispose();renderer.dispose();
      scene.traverse(obj=>{const p=obj as THREE.Points;p.geometry?.dispose?.();const m=p.material as THREE.Material|undefined;m?.dispose?.();});
      if(renderer.domElement.parentElement===el)el.removeChild(renderer.domElement);
    };
  },[url]);

  return <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-[#0f1719]">
    <div ref={host} className="h-[58vh] min-h-[420px] max-h-[700px] w-full"/>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/25 px-4 py-3 text-xs text-white/75">
      <span>{status}</span><span>{count?count.toLocaleString("pt-BR")+" pontos exibidos":""}</span>
    </div>
  </div>;
}

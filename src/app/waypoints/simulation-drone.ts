import {MercatorCoordinate,type Map as LibreMap,type CustomLayerInterface,type CustomRenderMethodInput} from "maplibre-gl";
import type {FlightFrame} from "@/lib/flight-simulation";

type Matrix=ArrayLike<number>;
function multiply(a:Matrix,b:Matrix):Float32Array{const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let sum=0;for(let k=0;k<4;k++)sum+=a[k*4+r]*b[c*4+k];out[c*4+r]=sum;}return out;}
function box(out:number[],x:number,y:number,z:number,w:number,l:number,h:number,color:number[],angle=0){
 const vertices=[[-w/2,-l/2,-h/2],[w/2,-l/2,-h/2],[w/2,l/2,-h/2],[-w/2,l/2,-h/2],[-w/2,-l/2,h/2],[w/2,-l/2,h/2],[w/2,l/2,h/2],[-w/2,l/2,h/2]];
 const faces=[[4,5,6,7],[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],light=[1,.42,.60,.76,.83,.55],c=Math.cos(angle),s=Math.sin(angle);
 faces.forEach((face,i)=>{for(const index of [face[0],face[1],face[2],face[0],face[2],face[3]]){const v=vertices[index];out.push(x+v[0]*c-v[1]*s,y+v[0]*s+v[1]*c,z+v[2],...color.map(n=>n*light[i]));}});
}
/** Procedural 3D mesh, intentionally enlarged on screen. Not a dimensional DJI model. */
export class SimulationDrone implements CustomLayerInterface{
 id="simulation-drone-3d";type="custom" as const;renderingMode="3d" as const;
 private map:LibreMap|null=null;private program:WebGLProgram|null=null;private body:WebGLBuffer|null=null;private rotor:WebGLBuffer|null=null;private vao:WebGLVertexArrayObject|null=null;private uniform:WebGLUniformLocation|null=null;private bodyCount=0;private rotorCount=0;
 frame:FlightFrame|null=null;rotorAngle=0;renderCount=0;
 onAdd(map:LibreMap,gl:WebGL2RenderingContext){
  this.map=map;
  const compile=(type:number,source:string)=>{const shader=gl.createShader(type);if(!shader)throw Error("Não foi possível preparar o drone 3D.");gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(error||"Falha no drone 3D.");}return shader;};
  const vertex=compile(gl.VERTEX_SHADER,"#version 300 es\nprecision highp float;layout(location=0) in vec3 position;layout(location=1) in vec3 color;uniform mat4 matrix;out vec3 shade;void main(){gl_Position=matrix*vec4(position,1.0);shade=color;}");
  const fragment=compile(gl.FRAGMENT_SHADER,"#version 300 es\nprecision highp float;in vec3 shade;out vec4 outColor;void main(){outColor=vec4(shade,1.0);}");
  this.program=gl.createProgram();if(!this.program)throw Error("Drone 3D indisponível.");gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error("Falha ao inicializar o drone 3D.");
  this.uniform=gl.getUniformLocation(this.program,"matrix");this.vao=gl.createVertexArray();
  const body:number[]=[],rotor:number[]=[];
  box(body,0,0,.1,1.12,1.65,.4,[.83,.91,.96]);box(body,0,-.12,.33,.80,1.05,.08,[.23,.31,.36]);box(body,0,.86,-.04,.44,.24,.28,[.12,.17,.21]);box(body,0,1.0,-.04,.25,.05,.17,[.12,.78,.94]);
  for(const x of [-1.28,1.28])for(const y of [-1.16,1.16]){box(body,x/2,y/2,0,.18,1.85,.16,[.63,.72,.78],-Math.atan2(x,y));box(body,x,y,.08,.26,.26,.34,[.23,.29,.34]);box(body,x,y-.12,-.14,.19,.16,.12,y>0?[.20,1,.60]:[1,.34,.22]);}
  box(rotor,0,0,0,1.52,.13,.035,[.12,.19,.23]);box(rotor,0,0,.005,.13,1.52,.035,[.27,.39,.44]);
  this.bodyCount=body.length/6;this.rotorCount=rotor.length/6;
  this.body=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.body);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(body),gl.STATIC_DRAW);
  this.rotor=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.rotor);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(rotor),gl.STATIC_DRAW);
 }
 render(gl:WebGL2RenderingContext,input:CustomRenderMethodInput){
  const f=this.frame;if(!f||!this.map||!this.program||!this.body)return;
  const p=MercatorCoordinate.fromLngLat(f.position,f.height),scale=13/(512*2**this.map.getZoom()),a=f.heading*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  // Mercator y grows south; mesh y points toward the nose/north.
  const model=[c*scale,s*scale,0,0,s*scale,-c*scale,0,0,0,0,scale,0,p.x,p.y,p.z,1];
  const projection=input.defaultProjectionData.mainMatrix,matrix=multiply(projection,model);
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  const draw=(buffer:WebGLBuffer|null,count:number,m:Float32Array)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);gl.uniformMatrix4fv(this.uniform,false,m);gl.drawArrays(gl.TRIANGLES,0,count);};
  draw(this.body,this.bodyCount,matrix);
  for(const x of [-1.28,1.28])for(const y of [-1.16,1.16]){const angle=this.rotorAngle*(x*y>0?1:-1),rc=Math.cos(angle),rs=Math.sin(angle),local=[rc,rs,0,0,-rs,rc,0,0,0,0,1,0,x,y,.28,1];draw(this.rotor,this.rotorCount,multiply(matrix,local));}
  gl.bindVertexArray(null);this.renderCount++;
 }
 onRemove(_map:LibreMap,gl:WebGL2RenderingContext){if(this.body)gl.deleteBuffer(this.body);if(this.rotor)gl.deleteBuffer(this.rotor);if(this.vao)gl.deleteVertexArray(this.vao);if(this.program)gl.deleteProgram(this.program);this.map=null;this.body=null;this.rotor=null;this.program=null;}
}

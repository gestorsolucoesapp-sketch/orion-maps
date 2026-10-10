import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGrid, validateBoundary, parseBoundaryGeoJson } from '../src/lib/flight-plan.ts';
import {validateExclusions,segmentAvoidsHoles} from '../src/lib/flight-exclusions.ts';
import { previewKmz, previewKml, missionCsv } from '../src/lib/mission-export.ts';
import { unzipSync, strFromU8 } from 'fflate';
const degree=180/(Math.PI*6371008.8);
const square=[[0,0],[100*degree,0],[100*degree,100*degree],[0,100*degree]];
const config={spacing:20,photoSpacing:25,bearing:0,speed:5,doubleGrid:false};
test('100 m square produces five clipped north-south strips and expected survey area',()=>{
 const g=generateGrid(square,config);
 assert.ok(Math.abs(g.area-10000)<1e-7);assert.equal(g.legs.length,5);assert.ok(Math.abs(g.length-500)<1e-7);assert.ok(Math.abs(g.seconds-100)<1e-7);
 for(const leg of g.legs)for(const [x,y] of leg){assert.ok(x>=0&&x<=100*degree+1e-10);assert.ok(y>=-1e-10&&y<=100*degree+1e-10);}
 assert.ok(g.photos.length>=25);
});
test('single grid flies out on one strip and back on its adjacent strip',()=>{
 const g=generateGrid(square,config);
 for(let i=1;i<g.legs.length;i++){
  const previous=g.legs[i-1],current=g.legs[i];
  assert.ok(current[0][0]>previous[0][0]);
  assert.ok((previous[1][1]-previous[0][1])*(current[1][1]-current[0][1])<0);
  assert.ok(Math.abs(previous[1][1]-current[0][1])<1e-8);
 }
});
test('double grid adds perpendicular coverage and respects bearing rotation',()=>{
 const single=generateGrid(square,config),double=generateGrid(square,{...config,doubleGrid:true});
 assert.ok(Math.abs(double.length-single.length*2)<1e-7);
 const rotated=generateGrid(square,{...config,bearing:90});assert.ok(Math.abs(rotated.legs[0][0][1]-rotated.legs[0][1][1])<1e-8);
});
test('concave boundary produces separate legs rather than crossing its excluded notch',()=>{
 const u=[[0,0],[100,0],[100,100],[70,100],[70,30],[30,30],[30,100],[0,100]].map(p=>p.map(v=>v*degree));
 const g=generateGrid(u,{...config,bearing:90});
 for(const leg of g.legs){const x=(leg[0][0]+leg[1][0])/2/degree,y=(leg[0][1]+leg[1][1])/2/degree;assert.ok(!(x>30.001&&x<69.999&&y>30.001));}
});
test('invalid polygons and excessive calculations are rejected',()=>{
 assert.throws(()=>validateBoundary([square[0],square[2],square[1],square[3]]));
 assert.throws(()=>validateBoundary([square[0],square[0],square[2]]));
 assert.throws(()=>validateBoundary([[0,0],[1,0],[1,1]]));
 assert.throws(()=>generateGrid(square,{...config,spacing:0}));
 assert.throws(()=>generateGrid(square,{...config,photoSpacing:0.00001}));
 assert.throws(()=>parseBoundaryGeoJson({type:'Polygon',coordinates:[[...square,square[0]],[...square,square[0]]]}));
});
test('closed GeoJSON polygon imports with no duplicate closing vertex',()=>{
 assert.deepEqual(parseBoundaryGeoJson({type:'Feature',geometry:{type:'Polygon',coordinates:[[...square,square[0]]]}}),square);
});
test('isolated area subtracts from survey and every flight segment avoids its clearance polygon',()=>{
 const hole=[[40,40],[60,40],[60,60],[40,60]].map(p=>p.map(v=>v*degree));
 const check=validateExclusions(square,[hole]);
 assert.ok(Math.abs(check.area-9600)<1e-6);
 const grid=generateGrid(square,{...config,spacing:10},[hole]);
 assert.ok(Math.abs(grid.area-9600)<1e-6);
 const route=grid.legs.flat().map(check.projection.toLocal);
 for(let i=1;i<route.length;i++)assert.ok(segmentAvoidsHoles(route[i-1],route[i],check.holes),`segment ${i} crosses isolated area`);
 assert.ok(grid.legs.length>10);
});
test('isolated areas outside or overlapping the perimeter are rejected',()=>{
 const inside=[[10,10],[20,10],[20,20],[10,20]].map(p=>p.map(v=>v*degree));
 const outside=[[90,90],[110,90],[110,110],[90,110]].map(p=>p.map(v=>v*degree));
 assert.throws(()=>validateExclusions(square,[outside]),/dentro|cruza/);
 assert.throws(()=>validateExclusions(square,[inside,inside]),/sobrepor/);
});
test('two isolated areas stay outside every segment of rotated single and double grids',()=>{
 const holes=[[[18,20],[31,20],[31,35],[18,35]],[[62,58],[79,58],[79,74],[62,74]]].map(ring=>ring.map(p=>p.map(v=>v*degree)));
 const validated=validateExclusions(square,holes);
 for(const bearing of [0,35,90])for(const doubleGrid of [false,true]){
  const grid=generateGrid(square,{...config,spacing:12,bearing,doubleGrid},holes);
  assert.ok(Math.abs(grid.area-(10000-13*15-17*16))<1e-5);
  const route=grid.legs.flat().map(validated.projection.toLocal);
  for(let i=1;i<route.length;i++)assert.ok(segmentAvoidsHoles(route[i-1],route[i],validated.holes),`bearing ${bearing} double ${doubleGrid} segment ${i}`);
 }
});
test('KMZ is a readable ZIP with escaped KML and no executable DJI mission',()=>{
 const g=generateGrid(square,config),files=unzipSync(previewKmz('Área & <Teste>',g.legs,100));
 assert.deepEqual(Object.keys(files),['doc.kml']);const kml=strFromU8(files['doc.kml']);
 assert.ok(kml.includes('Área &amp; &lt;Teste&gt;'));assert.ok(kml.includes('clampToGround'));assert.ok(!kml.includes('waylines.wpml'));
 assert.equal(kml,previewKml('Área & <Teste>',g.legs,100));
 assert.ok(missionCsv(g.legs,100,5,-90).startsWith('segment,point,longitude_deg,latitude_deg'));
});

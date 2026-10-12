import assert from 'node:assert/strict';
import {test} from 'node:test';
import {unzipSync,strFromU8} from 'fflate';
import {generateGrid} from '../src/lib/flight-plan.ts';
import {calculateGsd} from '../src/lib/gsd.ts';
import {previewKmz,missionCsv} from '../src/lib/mission-export.ts';
import {estimatePhotoCount,photoMissionKmz,photoMissionRoute} from '../src/lib/photo-mission.ts';
import {buildFlightSimulation} from '../src/lib/flight-simulation.ts';
import {buildKmzSimulation} from '../src/lib/kmz-inspection.ts';

const degree=180/(Math.PI*6371008.8);
const boundary=[[0,0],[145,0],[145,100],[0,100]].map(([x,y])=>[-47+x*degree,-21+y*degree]);
const options={spacing:10,photoSpacing:25,bearing:0,speed:5,doubleGrid:false};
const asCoordinate=(value)=>value.split(',').slice(0,2).map(Number);

test('grid simples exports the exact displayed 28-point serpentine order',()=>{
 const grid=generateGrid(boundary,options),route=grid.legs.flat();
 assert.equal(route.length,28);
 assert.deepEqual(generateGrid(boundary,options).legs,grid.legs);
 assert.equal(new Set(route.map(point=>point.join(','))).size,route.length);
 for(let i=0;i<grid.legs.length;i++){
  const [start,end]=grid.legs[i];
  assert.equal(start[0],end[0]);
  assert.equal(Math.sign(end[1]-start[1]),i%2?-1:1);
 }

 const preview=unzipSync(previewKmz('Ordem 01 a 28',grid.legs,100));
 const kml=strFromU8(preview['doc.kml']);
 const sections=[...kml.matchAll(/<Placemark><name>Trecho (\d+)<\/name>.*?<coordinates>([^<]+)<\/coordinates><\/LineString><\/Placemark>/gs)];
 assert.equal(sections.length,grid.legs.length);
 assert.deepEqual(sections.map(([,number])=>Number(number)),grid.legs.map((_,i)=>i+1));
 assert.deepEqual(sections.flatMap(([, ,coordinates])=>coordinates.split(' ').map(asCoordinate)),route);

 const csv=missionCsv(grid.legs,100,5,-90).trim().split('\r\n').slice(1);
 assert.equal(csv.length,route.length);
 assert.deepEqual(csv.map(row=>row.split(',').slice(2,4).map(Number)),route);

 const missionRoute=photoMissionRoute(grid.legs,grid.captureLegs);
 assert.deepEqual(missionRoute.route,route);
 const files=unzipSync(photoMissionKmz({name:'Ordem 01 a 28',...missionRoute,height:100,speed:5,gimbal:-90,captureMode:'time',interval:3}));
 for(const file of ['wpmz/template.kml','wpmz/waylines.wpml']){
  const xml=strFromU8(files[file]);
  const marks=[...xml.matchAll(/<Placemark><Point><coordinates>([^<]+)<\/coordinates><\/Point><wpml:index>(\d+)<\/wpml:index>/g)];
  assert.equal(marks.length,route.length);
  assert.deepEqual(marks.map(([, ,index])=>Number(index)),route.map((_,i)=>i));
  assert.deepEqual(marks.map(([,coordinates])=>asCoordinate(coordinates)),route);
 }
});

test('grid duplo adds a second direction while perimeter remains independent',()=>{
 const simple=generateGrid(boundary,options);
 const double=generateGrid(boundary,{...options,doubleGrid:true});
 const withPerimeter=generateGrid(boundary,{...options,perimeterPass:true});
 assert.ok(double.legs.length>simple.legs.length);
 assert.equal(withPerimeter.legs.length,simple.legs.length+1);
 assert.equal(withPerimeter.captureLegs.at(-1),true);
 assert.deepEqual(withPerimeter.legs.slice(0,-1),simple.legs);
});

for(const perimeterPass of [false,true])test(`plan, export and reopened preview agree on continuous photos; perimeter ${perimeterPass}`,()=>{
 const grid=generateGrid(boundary,{...options,perimeterPass}),route=photoMissionRoute(grid.legs,grid.captureLegs);
 const speed=5,interval=3,planCount=estimatePhotoCount(grid.legs,grid.captureLegs,speed,'time',interval);
 const sim=buildFlightSimulation({legs:grid.legs,captureLegs:grid.captureLegs,height:100,speed,captureMode:'time',photoInterval:interval,captureDistance:12,includeTakeoff:false,turnSeconds:0,returnHome:false});
 const xml=strFromU8(unzipSync(photoMissionKmz({name:'Mesmo plano',...route,height:100,speed,gimbal:-90,captureMode:'time',interval}))['wpmz/waylines.wpml']);
 const photos=[...xml.matchAll(/<wpml:actionGroup>(.*?)<\/wpml:actionGroup>/gs)].map(([,body])=>body).filter(body=>body.includes('<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>'));
 assert.equal(photos.length,1);
 assert.match(photos[0],new RegExp(`<wpml:actionGroupStartIndex>${route.captureRanges[0].start}<\\/wpml:actionGroupStartIndex>`));
 assert.match(photos[0],new RegExp(`<wpml:actionGroupEndIndex>${route.captureRanges[0].end}<\\/wpml:actionGroupEndIndex>`));
 const file={kind:'mission',name:'Mesmo plano',waypoints:route.route.map((point,index)=>({index,point,height:100,speed})),photoActions:[{...route.captureRanges[0],trigger:'multipleTiming',interval}],finishAction:'goHome',droneEnum:'68',templateWaypoints:null,integrityIssues:[],notes:[]};
 const reopened=buildKmzSimulation(file);
 assert.equal(planCount,sim.photos.length);
 assert.equal(planCount,reopened.photos.length);
 assert.ok(Math.abs(sim.captureM-sim.routeM)<1e-8);
 assert.ok(Math.abs(reopened.captureM-reopened.routeM)<1e-8);
});

test('85% side overlap survives plan JSON and produces denser saved and exported grid',()=>{
 const settings={diagonalFov:84,sensorWidth:13.2,sensorHeight:8.8,focal:8.8,imageWidth:4096,imageHeight:3072,height:100,front:80,side:85,speed:5,bearing:0,gimbal:-90};
 const plan=JSON.parse(JSON.stringify({version:1,name:'Sobreposição 85',mode:'grid',points:boundary,settings}));
 assert.equal(plan.settings.side,85);
 const gsd=side=>calculateGsd({diagonalFov:plan.settings.diagonalFov,sensorWidth:plan.settings.sensorWidth,sensorHeight:plan.settings.sensorHeight,focalLength:plan.settings.focal,imageWidth:plan.settings.imageWidth,imageHeight:plan.settings.imageHeight,height:plan.settings.height,frontOverlap:plan.settings.front,sideOverlap:side,speed:plan.settings.speed,targetGsd:3});
 const dense=gsd(plan.settings.side),standard=gsd(70);
 assert.ok(Math.abs(dense.lineSpacing/standard.lineSpacing-0.5)<1e-12);
 const route=generateGrid(plan.points,{spacing:dense.lineSpacing,photoSpacing:dense.photoSpacing,bearing:plan.settings.bearing,speed:plan.settings.speed,doubleGrid:false});
 const standardRoute=generateGrid(plan.points,{spacing:standard.lineSpacing,photoSpacing:standard.photoSpacing,bearing:plan.settings.bearing,speed:plan.settings.speed,doubleGrid:false});
 assert.ok(route.legs.length>standardRoute.legs.length);
 assert.equal(missionCsv(route.legs,plan.settings.height,plan.settings.speed,plan.settings.gimbal).trim().split('\r\n').length-1,route.legs.flat().length);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildKmzSimulation,compareKmzToPlan} from '../src/lib/kmz-inspection.ts';

const route=[[-47,-21],[-47,-20.99985],[-46.9999,-20.99985],[-46.9999,-21],[-46.9998,-21],[-46.9998,-20.99985]];
const file={kind:'mission',name:'Teste',waypoints:route.map((point,index)=>({index,point,height:100,speed:5})),photoActions:[{start:0,end:1,trigger:'multipleTiming',interval:2},{start:4,end:5,trigger:'multipleTiming',interval:2}],finishAction:'goHome',droneEnum:'68',templateWaypoints:null,integrityIssues:[],notes:[]};
const expected={route,height:100,speed:5,captureMode:'time',interval:2,captureRanges:[{start:0,end:1},{start:4,end:5}]};

test('file playback follows its exact waypoint order and only XML photo ranges',()=>{
 const sim=buildKmzSimulation(file);
 assert.deepEqual(sim.route,route);
 assert.equal(sim.homeAssumed,true);
 assert.equal(sim.returnHome,false);
 assert.equal(sim.segments.some(segment=>segment.phase==='takeoff'),false);
 assert.equal(sim.segments[0].start,0);
 assert.equal(sim.segments[0].fromHeight,100);
 const moving=sim.segments.filter(segment=>segment.distanceEnd>segment.distanceStart);
 assert.deepEqual(moving.map(segment=>segment.phase),['survey','connection','connection','connection','survey']);
 assert.equal(sim.photos.filter(photo=>photo.time<=moving[0].end).length>=1,true);
 assert.equal(sim.photos.filter(photo=>photo.time>=moving.at(-1).start).length>=1,true);
 assert.equal(sim.photos.some(photo=>photo.time>moving[0].end&&photo.time<moving.at(-1).start),false);
});

test('comparison reports coordinate order, height, speed and action differences',()=>{
 assert.deepEqual(compareKmzToPlan(file,expected),[]);
 const different={...file,waypoints:file.waypoints.map(item=>({...item})),photoActions:[...file.photoActions]};
 different.waypoints[1]={...different.waypoints[1],point:[-46.9999,-20.99985],height:110,speed:6};
 different.photoActions[0]={...different.photoActions[0],interval:3};
 const issues=compareKmzToPlan(different,expected).join(' ');
 assert.match(issues,/Coordenada ou ordem/);
 assert.match(issues,/Altura diferente/);
 assert.match(issues,/Ações de fotos diferentes/);
 different.waypoints[1]={...file.waypoints[1],speed:6};
 assert.match(compareKmzToPlan(different,expected).join(' '),/Velocidade diferente/);
});

test('visualization cannot be mistaken for an executable mission',()=>{
 const visualization={kind:'visualization',name:'Desenho',route,notes:[]};
 assert.deepEqual(compareKmzToPlan(visualization,expected),[]);
 assert.throws(()=>buildKmzSimulation({...file,integrityIssues:['template differs']}),/divergências internas/);
 assert.throws(()=>buildKmzSimulation({...file,waypoints:file.waypoints.map((item,i)=>({...item,height:i?110:100}))}),/varia altura/);
});

test('RC2 expected preview preserves each exported edge for 2, 3, 4, 7 and 36 waypoints',()=>{
 for(const count of [2,3,4,7,36]){
  const points=Array.from({length:count},(_,i)=>[-46.852+i*.00021,-21.596+(i%3)*.00018]);
  const mission={...file,waypoints:points.map((point,index)=>({index,point,height:80,speed:5.7})),photoActions:[]};
  const simulation=buildKmzSimulation(mission);
  const moving=simulation.segments.filter(segment=>segment.distanceEnd>segment.distanceStart);
  assert.deepEqual(simulation.route,points,`route ${count}`);
  assert.equal(moving.length,count-1,`edge count ${count}`);
  for(let i=0;i<moving.length;i++){
   assert.deepEqual(moving[i].from,points[i],`edge ${i+1} start for ${count}`);
   assert.deepEqual(moving[i].to,points[i+1],`edge ${i+1} end for ${count}`);
  }
  assert.equal(simulation.returnHome,false);
 }
});

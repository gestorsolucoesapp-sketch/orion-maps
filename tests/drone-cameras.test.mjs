import test from 'node:test';
import assert from 'node:assert/strict';
import {droneProfiles,findCamera} from '../src/lib/drone-cameras.ts';
import {calculateGsd} from '../src/lib/gsd.ts';
const base={sensorWidth:13.2,sensorHeight:8.8,focalLength:8.8,imageWidth:5472,imageHeight:3648,height:100,frontOverlap:80,sideOverlap:70,speed:5,targetGsd:3};
const compute=c=>calculateGsd({...base,diagonalFov:c.fov,imageWidth:c.imageWidth,imageHeight:c.imageHeight});
test('all ten requested drones have unique usable camera modes',()=>{
 assert.equal(droneProfiles.length,10);assert.equal(new Set(droneProfiles.map(p=>p.name)).size,10);
 for(const p of droneProfiles){assert.equal(new Set(p.cameras.map(c=>c.id)).size,p.cameras.length);for(const c of p.cameras){assert.ok(compute(c).gsdX>0);assert.ok(Number.isInteger(c.imageWidth));assert.ok(Number.isInteger(c.imageHeight));}}
});
test('Mini 5 uses 84 degrees: 100m diagonal footprint 180.08m; resolution changes GSD, not coverage',()=>{
 const low=compute(findCamera('DJI Mini 5 Pro','wide-12')),high=compute(findCamera('DJI Mini 5 Pro','wide-50'));
 assert.ok(Math.abs(Math.hypot(low.footprintWidth,low.footprintHeight)-180.0808089)<0.0001);
 assert.equal(low.footprintWidth,high.footprintWidth);assert.equal(low.gsdX,high.gsdX*2);
});
test('Mavic 4 main camera retains 3:2 aspect and telephoto narrows footprint',()=>{
 const main=compute(findCamera('DJI Mavic 4 Pro','main-100')),tele=compute(findCamera('DJI Mavic 4 Pro','tele-50'));
 assert.ok(Math.abs(main.footprintWidth/main.footprintHeight-1.5)<1e-12);assert.ok(tele.footprintWidth<main.footprintWidth/3);
});
test('unlisted high-resolution timer modes stay unavailable',()=>{
 for(const model of ['DJI Lito X1','Potensic Atom 2'])assert.equal(findCamera(model,'wide-48').minInterval,null);
 assert.equal(findCamera('DJI Mavic 3 Pro','medium-48').minInterval,7);
});
test('legacy physical-camera calculations remain unchanged; invalid FOV rejected',()=>{
 assert.equal(calculateGsd(base).footprintWidth,150);
 for(const diagonalFov of [0,180,-1,NaN,Infinity])assert.throws(()=>calculateGsd({...base,diagonalFov}));
});

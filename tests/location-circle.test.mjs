import test from 'node:test';
import assert from 'node:assert/strict';
import { accuracyRing } from '../src/lib/location-circle.ts';
test('accuracy circle stays 89 metres from its center at different latitudes',()=>{
 for(const center of [[0,0],[-47,-15],[10,60]]){
  const ring=accuracyRing(center,89),rad=Math.PI/180;
  assert.equal(ring.length,65);assert.deepEqual(ring[0],ring.at(-1));
  for(const point of ring){
   const a=Math.sin((point[1]-center[1])*rad/2)**2+Math.cos(center[1]*rad)*Math.cos(point[1]*rad)*Math.sin((point[0]-center[0])*rad/2)**2;
   assert.ok(Math.abs(2*6371008.8*Math.asin(Math.sqrt(a))-89)<0.001);
  }
 }
});
test('invalid or zero accuracy does not invent a radius',()=>{
 for(const radius of [0,-1,NaN,Infinity])assert.deepEqual(accuracyRing([0,0],radius),[]);
});

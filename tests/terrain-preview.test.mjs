import test from 'node:test';
import assert from 'node:assert/strict';
import {validRange,validSample,terrainColor,slopePercentAt} from '../src/lib/terrain-preview.ts';

test('NoData is excluded before determining the elevation colour scale',()=>{
 assert.deepEqual(validRange(new Float64Array([-9999,771.86,792.34,813.52,NaN]),-9999),{min:771.86,max:813.52,count:3});
 assert.equal(validSample(-9999,-9999),false);
 assert.equal(validSample(NaN,null),false);
 assert.deepEqual(validRange([-9500,-9400],-9999),{min:-9500,max:-9400,count:2});
});
test('low, middle and high terrain elevations use distinct colours',()=>{
 for(const kind of ['dtm','dsm']){
  assert.notDeepEqual(terrainColor(771.86,771.86,813.52,kind),terrainColor(792.69,771.86,813.52,kind));
  assert.notDeepEqual(terrainColor(792.69,771.86,813.52,kind),terrainColor(813.52,771.86,813.52,kind));
 }
});
test('flat surfaces stay valid, not transparent or divide-by-zero',()=>{
 assert.deepEqual(validRange([800,800,-9999],-9999),{min:800,max:800,count:2});
 assert.ok(terrainColor(800,800,800,'dtm').every(Number.isFinite));
 assert.equal(slopePercentAt(new Float64Array(25).fill(800),5,5,2,2,.2,.2,-9999),0);
});
test('Horn gradient matches a known inclined plane in percent',()=>{
 const width=5,height=5,dx=.2,dy=.4;
 const band=Float64Array.from({length:25},(_,i)=>800+(i%width)*dx*.1+Math.floor(i/width)*dy*.2);
 const actual=slopePercentAt(band,width,height,2,2,dx,dy,-9999);
 assert.ok(Math.abs(actual-100*Math.hypot(.1,.2))<1e-8);
});
test('NoData neighbours and edges are not used as false steep slopes',()=>{
 const band=new Float64Array(25).fill(800);band[6]=-9999;
 assert.ok(Number.isNaN(slopePercentAt(band,5,5,2,2,.2,.2,-9999)));
 assert.ok(Number.isNaN(slopePercentAt(band,5,5,0,0,.2,.2,-9999)));
 assert.equal(slopePercentAt(band,5,5,3,3,.2,.2,-9999),0);
});
test('empty rasters fail explicitly and steep slopes retain a visible class',()=>{
 assert.throws(()=>validRange([-9999,NaN],-9999),/válidas/);
 assert.notDeepEqual(terrainColor(1,0,300,'slope'),terrainColor(100,0,300,'slope'));
});

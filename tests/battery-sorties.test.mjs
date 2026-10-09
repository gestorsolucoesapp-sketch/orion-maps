import test from 'node:test';
import assert from 'node:assert/strict';
import {planBatterySorties} from '../src/lib/battery-sorties.ts';

const degree=180/(Math.PI*6371008.8);
const route=[0,300,0,300,0,300,0].map(m=>[m*degree,0]);
const base={legs:[route],home:[0,0],speed:5,height:60,totalMinutes:5,reservePercent:15,climbSpeed:2,descentSpeed:2,turnSeconds:1};

test('splits a long route at ordered checkpoints and budgets every return',()=>{
 const original=JSON.stringify(base),plan=planBatterySorties(base);
 assert.equal(plan.error,'');assert.ok(plan.sorties.length>1);
 assert.equal(plan.sorties[0].startWaypoint,1);
 assert.equal(plan.sorties.at(-1).endWaypoint,route.length);
 plan.sorties.forEach((sortie,i)=>{
  assert.ok(sortie.estimatedSeconds<=plan.usableSeconds+1e-6);
  assert.ok(sortie.landingBatteryPercent>=15-1e-6);
  if(i)assert.equal(sortie.startWaypoint,plan.sorties[i-1].endWaypoint);
 });
 assert.equal(JSON.stringify(base),original);
});

test('rejects a segment that cannot be flown and returned with reserve',()=>{
 const plan=planBatterySorties({...base,totalMinutes:1});
 assert.match(plan.error,/Não há autonomia/);
 assert.equal(plan.sorties.length,0);
});

test('a nearby route fits one sortie and respects an explicit base',()=>{
 const plan=planBatterySorties({...base,home:[-50*degree,0],totalMinutes:20});
 assert.equal(plan.error,'');assert.equal(plan.sorties.length,1);
 assert.equal(plan.homeAssumed,false);assert.ok(plan.sorties[0].approachMeters>40);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {routeMetrics,formatFlightTime} from '../src/lib/mission-metrics.ts';
test('includes transfers and both passes in route distance',()=>{const d=180/(Math.PI*6371008.8);const m=routeMetrics([[[0,0],[0,100*d]],[[10*d,100*d],[10*d,0]]],5,27);assert.ok(Math.abs(m.length-210)<0.01);assert.equal(m.waypoints,4);assert.equal(m.photos3,14);assert.equal(m.photos5,9);assert.equal(m.batteries,1);});
test('reference 223m at 6.5m/s gives 34s and 12/7 images',()=>{const d=180/(Math.PI*6371008.8);const m=routeMetrics([[[0,0],[0,223*d]]],6.5,27);assert.equal(formatFlightTime(m.seconds),'0min 34s');assert.equal(m.photos3,12);assert.equal(m.photos5,7);});
test('empty routes have no batteries or photos',()=>{const m=routeMetrics([],5,27);assert.equal(m.batteries,0);assert.equal(m.photos3,0);});

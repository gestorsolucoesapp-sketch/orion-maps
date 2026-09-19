import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateGsd } from '../src/lib/gsd.ts';

const camera = { sensorWidth: 6.17, sensorHeight: 4.6275, focalLength: 5, imageWidth: 4000, imageHeight: 3000, height: 100, frontOverlap: 80, sideOverlap: 70, speed: 5, targetGsd: 5 };
test('matches published Pix4D 5 cm/pixel example at 162.07 m', () => {
  const result = calculateGsd(camera);
  assert.ok(Math.abs(result.targetHeight - 162.07455) < 0.00001);
  const target = calculateGsd({ ...camera, height: result.targetHeight });
  assert.ok(Math.abs(target.gsdX - 5) < 1e-10);
  assert.ok(Math.abs(target.gsdY - 5) < 1e-10);
});
test('doubling height doubles GSD and footprint, with consistent overlap spacing', () => {
  const a = calculateGsd(camera), b = calculateGsd({ ...camera, height: 200 });
  assert.equal(b.gsdX, a.gsdX * 2);
  assert.equal(b.footprintHeight, a.footprintHeight * 2);
  assert.ok(Math.abs(a.photoSpacing - 18.51) < 1e-9);
  assert.ok(Math.abs(a.lineSpacing - 37.02) < 1e-9);
  assert.ok(Math.abs(a.interval - 3.702) < 1e-9);
});
test('target height respects the worse resolution of both image axes', () => {
  const result = calculateGsd({ ...camera, imageHeight: 1500 });
  const target = calculateGsd({ ...camera, imageHeight: 1500, height: result.targetHeight });
  assert.ok(Math.abs(Math.max(target.gsdX, target.gsdY) - 5) < 1e-10);
});
test('rejects invalid camera, flight and overlap inputs', () => {
  for (const patch of [{ height: 0 }, { focalLength: -1 }, { speed: NaN }, { imageWidth: 4.5 }, { frontOverlap: 100 }, { sideOverlap: -1 }]) {
    assert.throws(() => calculateGsd({ ...camera, ...patch }));
  }
});

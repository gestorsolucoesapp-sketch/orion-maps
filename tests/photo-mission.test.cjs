const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {unzipSync,strFromU8} = require('fflate');

const file = path.join(__dirname, '../src/lib/photo-mission.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const mod = {exports: {}};
new Function('module', 'exports', 'require', compiled)(mod, mod.exports, require);
const {photoMissionKmz,photoMissionRoute} = mod.exports;
const point = (x,y) => [x,y];
const mission = (captureMode, route) => ({
  name: 'QA fotos & limites', ...route, height: 90, speed: 4, gimbal: -90,
  captureMode, interval: captureMode === 'time' ? 3 : 12,
});
const content = (bytes) => {
  const files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files).sort(), ['wpmz/template.kml','wpmz/waylines.wpml']);
  return strFromU8(files['wpmz/waylines.wpml']);
};
const groups = (xml) => [...xml.matchAll(/<wpml:actionGroup>(.*?)<\/wpml:actionGroup>/gs)].map(([,body]) => ({
  start: Number(body.match(/<wpml:actionGroupStartIndex>(\d+)<\/wpml:actionGroupStartIndex>/)[1]),
  end: Number(body.match(/<wpml:actionGroupEndIndex>(\d+)<\/wpml:actionGroupEndIndex>/)[1]),
  body,
}));

for (const mode of ['time','distance']) {
  const route = photoMissionRoute([
    [point(-47,-21),point(-47.001,-21.001)],
    [point(-47.002,-21.002),point(-47.003,-21.003)],
    [point(-47.004,-21.004),point(-47.005,-21.005)],
  ], [true,false,true]);
  assert.deepEqual(route.captureRanges, [{start:0,end:1},{start:4,end:5}]);
  const xml = content(photoMissionKmz(mission(mode,route)));
  assert.match(xml, /xmlns:wpml="http:\/\/www\.dji\.com\/wpmz\/1\.0\.2"/);
  assert.match(xml, /QA fotos &amp; limites/);
  const actual = groups(xml);
  assert.deepEqual(actual.map(({start,end})=>({start,end})),route.captureRanges);
  assert.ok(actual.every(({body})=>body.includes('<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>')));
  assert.ok(actual.every(({body})=>body.includes(mode==='time'?'multipleTiming':'multipleDistance')));
  assert.equal((xml.match(/<wpml:actionGroup>/g)||[]).length,2);
}

const manual = content(photoMissionKmz(mission('manual',{route:[point(-47,-21),point(-47.001,-21.001)]})));
assert.equal(groups(manual).length,0);
assert.throws(()=>photoMissionKmz(mission('time',{route:[point(-47,-21),point(-47.001,-21.001)]})),/Intervalos de captura/);
assert.throws(()=>photoMissionKmz(mission('time',{route:[point(-47,-21),point(-47.001,-21.001)],captureRanges:[{start:0,end:2}]})),/Intervalos de captura/);
assert.throws(()=>photoMissionRoute([[point(-47,-21),point(-47.001,-21.001)]],[false]),/não contém trecho/);

(async()=>{
  const {generateGrid} = await import('../src/lib/flight-plan.ts');
  const degree=180/(Math.PI*6371008.8);
  const square=[[0,0],[100,0],[100,100],[0,100]].map(([x,y])=>point(x*degree,y*degree));
  const hole=[[40,40],[60,40],[60,60],[40,60]].map(([x,y])=>point(x*degree,y*degree));
  const grid=generateGrid(square,{spacing:10,photoSpacing:25,bearing:0,speed:5,doubleGrid:false,perimeterPass:true},[hole]);
  assert.ok(grid.captureLegs.includes(false));
  assert.equal(grid.captureLegs.at(-1),true);
  const route=photoMissionRoute(grid.legs,grid.captureLegs);
  assert.equal(route.captureRanges.at(-1).end,route.route.length-1);
  assert.equal(groups(content(photoMissionKmz(mission('time',route)))).length,grid.captureLegs.filter(Boolean).length);
  let offset=0;
  for(let i=0;i<grid.legs.length;i++){
    const range=route.captureRanges.find(item=>item.start===offset);
    assert.equal(Boolean(range),grid.captureLegs[i],`leg ${i}`);
    if(range)assert.equal(range.end,offset+grid.legs[i].length-1);
    offset+=grid.legs[i].length;
  }
  console.log('PHOTO_MISSION_UNIT_PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});

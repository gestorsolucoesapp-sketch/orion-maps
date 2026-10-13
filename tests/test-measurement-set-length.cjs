const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('src/lib/map-measurement.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const moduleRef={exports:{}};
new Function('require','module','exports',js)(require,moduleRef,moduleRef.exports);
const m=moduleRef.exports;

assert.equal(m.parseDesiredMetres('12,5'),12.5);
assert.equal(m.parseDesiredMetres(' 12.5 '),12.5);
for(const invalid of ['0','-1','abc','1,2,3','Infinity','100001'])assert.throws(()=>m.parseDesiredMetres(invalid));

const path={kind:'path',points:[[-46,-21.6],[-45.9999,-21.6],[-45.9998,-21.6]]};
const adjusted=m.adjustMeasurementSegment(path,0,'20,5');
assert.deepEqual(adjusted.points[0],path.points[0]);
assert.deepEqual(adjusted.points[2],path.points[2]);
assert.ok(Math.abs(m.measureDistance(adjusted.points[0],adjusted.points[1])-20.5)<0.001);
assert.equal(adjusted.manual_adjusted,true);
assert.equal(m.requireMeasurement({schema_version:1,...adjusted}).manual_adjusted,true);
assert.equal(m.requireMeasurement(JSON.parse(JSON.stringify({schema_version:1,...adjusted}))).manual_adjusted,true);
assert.equal(m.measurementGeoJSON('teste',{schema_version:1,...adjusted}).properties.manual_adjusted,true);
assert.notEqual(m.measureDrawing(adjusted).distance_m,m.measureDrawing(path).distance_m);

const polygon={kind:'polygon',points:[[-46,-21.6],[-45.9998,-21.6],[-45.9998,-21.5998],[-45.9999,-21.5999],[-46,-21.5998]]};
const before=m.measureDrawing(polygon);
assert.equal(before.complete,true);
const modified=m.adjustMeasurementSegment(polygon,0,'15');
assert.deepEqual(modified.points[0],polygon.points[0]);
assert.deepEqual(modified.points.slice(2),polygon.points.slice(2));
assert.ok(Math.abs(m.measureDistance(modified.points[0],modified.points[1])-15)<0.001);
assert.notEqual(m.measureDrawing(modified).area_m2,before.area_m2);
assert.throws(()=>m.adjustMeasurementSegment(polygon,2,'40'),/cruza|invalida/i);

console.log('measurement length: decimal input, moved endpoint, shared polygon geometry, area, self-intersection and metadata OK');

(async()=>{
  let stored=null;
  const surveys={surveySession:async()=>({user:{id:'33333333-3333-4333-8333-333333333333'},token:'token'}),requireSurvey:async()=>({id:'22222222-2222-4222-8222-222222222222'}),supabaseRequest:async(path,token,options)=>{
    if(options?.method==='POST'){stored=JSON.parse(options.body);return [stored];}
    return stored?[{...stored,created_at:'2026-10-13T00:00:00Z'}]:[];
  }};
  const actionJs=ts.transpileModule(fs.readFileSync('src/components/measurement/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const actionModule={exports:{}};
  new Function('require','module','exports',actionJs)(id=>id==='@/lib/supabase/surveys'?surveys:id==='@/lib/map-measurement'?m:require(id),actionModule,actionModule.exports);
  const saved=await actionModule.exports.saveMeasurement({id:'11111111-1111-4111-8111-111111111111',name:'área corrigida',survey_id:'22222222-2222-4222-8222-222222222222',measurement:{schema_version:1,...modified},image_source:'orthophoto'});
  assert.equal(saved.error,'');
  assert.equal(stored.measurement.manual_adjusted,true);
  assert.equal(stored.metrics.manual_adjusted,true);
  assert.equal(saved.saved.measurement.manual_adjusted,true);
  console.log('measurement persistence: manual adjustment survives server action and stored JSON');
})().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
function load(relative,dependencies={}){
 const file=path.join(__dirname,'..',relative),mod=new Module(file,module);
 mod.filename=file;mod.paths=module.paths;
 const original=mod.require.bind(mod);
 mod.require=id=>dependencies[id]||original(id);
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
 return mod.exports;
}
const geometry=load('src/lib/map-measurement.ts');
const report=load('src/lib/measurement-comparison.ts',{'./map-measurement':geometry});
const square={schema_version:1,kind:'polygon',points:[[0,0],[.001,0],[.001,.001],[0,.001]]};
const wider={schema_version:1,kind:'polygon',points:[[0,0],[.002,0],[.002,.001],[0,.001]]};
const row=(id,source,measurement,project='project')=>({id,name:id,survey_id:project,created_at:'2026-10-12T00:00:00Z',image_source:source,measurement});
let count=0;const test=(name,fn)=>{fn();count++;console.log('OK '+name)};

test('independently measured polygons use before area as percentage denominator',()=>{
 const comparison=report.compareSavedAreas([row('before','satellite_reference',square),row('after','orthophoto',wider)],'project','before','after');
 assert.ok(comparison.before&&comparison.after);
 assert.ok(comparison.after.area_m2>comparison.before.area_m2);
 assert.equal(comparison.delta_m2,comparison.after.area_m2-comparison.before.area_m2);
 assert.equal(comparison.delta_ha,comparison.delta_m2/10000);
 assert.equal(comparison.after.area_ha,comparison.after.area_m2/10000);
 assert.equal(comparison.delta_percent,100*comparison.delta_m2/comparison.before.area_m2);
 assert.equal(comparison.visual_only,false);
});
test('missing before or after never invents a delta',()=>{
 const comparison=report.compareSavedAreas([row('after','orthophoto',square)],'project','missing','after');
 assert.equal(comparison.before,null);assert.ok(comparison.after);
 assert.equal(comparison.delta_m2,null);assert.equal(comparison.delta_ha,null);assert.equal(comparison.delta_percent,null);
});
test('wrong source or project cannot be selected',()=>{
 const comparison=report.compareSavedAreas([row('wrong-source','orthophoto',square),row('wrong-project','satellite_reference',square,'other')],'project','wrong-source','wrong-project');
 assert.equal(comparison.before,null);assert.equal(comparison.after,null);
});
test('reused polygon with rotated order is visual comparison and zero difference',()=>{
 const rotated={...square,points:[square.points[2],square.points[3],square.points[0],square.points[1]]};
 const comparison=report.compareSavedAreas([row('before','satellite_reference',square),row('after','orthophoto',rotated)],'project','before','after');
 assert.equal(comparison.visual_only,true);assert.equal(comparison.delta_m2,0);assert.equal(comparison.delta_percent,0);
});
test('path is not accepted as an area measurement',()=>{
 const comparison=report.compareSavedAreas([row('before','satellite_reference',{schema_version:1,kind:'path',points:square.points}),row('after','orthophoto',square)],'project','before','after');
 assert.equal(comparison.before,null);assert.equal(comparison.delta_m2,null);
});
test('invalid geographic bounds are rejected',()=>{
 assert.equal(report.validGeoBounds({west:2,east:1,south:0,north:1}),null);
 assert.equal(report.validGeoBounds({west:0,east:1,south:0,north:NaN}),null);
});
test('same frame projects both outlines with north up',()=>{
 const bounds=report.validGeoBounds({west:0,east:2,south:0,north:1});
 const frame=report.comparisonFrame(bounds,[],3/2);
 assert.ok(Math.abs((frame.east-frame.west)/(frame.north-frame.south)-1.5)<1e-9);
 assert.ok(Math.abs(report.pointPercent([0,1],frame)[0])<1e-9);
 assert.ok(Math.abs(report.pointPercent([0,1],frame)[1]-12.5)<1e-9);
 assert.ok(Math.abs(report.pointPercent([2,0],frame)[0]-100)<1e-9);
 assert.ok(Math.abs(report.pointPercent([2,0],frame)[1]-87.5)<1e-9);
});
console.log(`COMPARISON_TESTS_PASSED=${count}`);

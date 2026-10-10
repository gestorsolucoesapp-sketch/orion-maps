const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),proj4=require('proj4');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m=new Module(file,module);m.filename=file;m.paths=module.paths;const normal=m.require.bind(m);m.require=id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):normal(id);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);cache.set(file,m.exports);return m.exports;}
const {previewTerrainFlight}=load(path.join(__dirname,'../src/lib/terrain-flight-preview.ts'));
const crs='+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs';
const gps=(x,y)=>proj4(crs,'EPSG:4326',[500000+x,7600000-y]);
function grid(){return {band:Float64Array.from({length:400},(_,i)=>100+(i%20)*.5),width:20,height:20,noData:-9999,dx:1,dy:1,west:500000,north:7600000,crs,sourceCrs:'EPSG:32723',metric:true};}
(async()=>{
 const home=gps(2.5,4.5),route=[gps(2.5,4.5),gps(12.5,4.5)];
 const result=await previewTerrainFlight(grid(),route,home,80);
 assert.equal(result.complete,true);assert.equal(result.missingSamples,0);assert.equal(result.homeGroundM,101);
 assert.equal(result.minRelativeHeightM,80);assert.equal(result.maxRelativeHeightM,85);
 assert.ok(result.points.length>=3);assert.ok(result.distanceM>9&&result.distanceM<11);
 const missing=grid();missing.band[4*20+7]=-9999;
 const gap=await previewTerrainFlight(missing,route,home,80);
 assert.equal(gap.complete,false);assert.ok(gap.missingSamples>0);
 await assert.rejects(previewTerrainFlight(grid(),route,gps(30,4.5),80),/ponto H/);
 console.log('TERRAIN_FLIGHT_PREVIEW_TESTS_PASSED');
})().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const file=path.join(__dirname,'../src/lib/photo-mission.ts');
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function('module','exports','require',compiled)(mod,mod.exports,require);
const {unzipSync,strFromU8}=require('fflate');
for(const mode of ['time','distance']){
 const bytes=mod.exports.photoMissionKmz({name:'QA fotos',route:[[-47,-21],[-47.001,-21.001]],height:90,speed:4,gimbal:-90,captureMode:mode,interval:mode==='time'?3:12});
 const files=unzipSync(bytes);assert.ok(files['wpmz/template.kml']);assert.ok(files['wpmz/waylines.wpml']);
 const xml=strFromU8(files['wpmz/waylines.wpml']);assert.ok(xml.includes('takePhoto'));assert.ok(xml.includes(mode==='time'?'multipleTiming':'multipleDistance'));
 fs.writeFileSync(path.join(__dirname,`qa-photo-${mode}.kmz`),bytes);
}
assert.throws(()=>mod.exports.photoMissionKmz({name:'x',route:[],height:90,speed:4,gimbal:-90,captureMode:'time',interval:3}));
console.log('PHOTO_MISSION_UNIT_PASS');

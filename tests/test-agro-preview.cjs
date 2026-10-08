const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file){const filename=path.resolve(__dirname,'../src/lib',file),code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const loaded={exports:{}};vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename})(id=>load(id+'.ts'),loaded,loaded.exports);return loaded.exports;}
const {selectAgroPreview}=load('agro-preview.ts');
const {orthophotoPreviewUrl}=load('orthophoto-preview-url.ts');
const survey='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const id=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
const bounds={west:-46.9,east:-46.89,south:-21.6,north:-21.59};
const job=(n,status='completed',sid=survey)=>({id:id(n),survey_id:sid,status});
const result=(n,j=1,overrides={})=>({id:id(n+100),job_id:id(j),survey_id:survey,kind:'orthophoto',mime_type:'image/png',preview_url:'https://test.supabase.co/preview.png',created_at:'2026-10-07T00:00:00Z',metadata:{bounds_wgs84:{...bounds}},...overrides});

test('same private raster URL and coordinates as the original Results map, no source mutation',()=>{const r=result(1),snapshot=JSON.stringify(r),a=selectAgroPreview(survey,[job(1)],[r]);assert.equal(a.url,orthophotoPreviewUrl(r));assert.deepEqual(a.bounds,bounds);assert.equal(a.result_id,r.id);assert.equal(JSON.stringify(r),snapshot);a.bounds.west=0;assert.equal(r.metadata.bounds_wgs84.west,bounds.west);});
test('newest completed job matches Results, not the order of its result images',()=>{const a=selectAgroPreview(survey,[job(3,'processing'),job(2),job(1)],[result(1,1),result(2,2)]);assert.equal(a.job_id,id(2));});
test('an explicitly linked original job remains pinned when newer processing completes',()=>{const a=selectAgroPreview(survey,[job(2),job(1)],[result(2,2),result(1,1)],id(1));assert.equal(a.job_id,id(1));});
test('missing, cancelled and active requested jobs never fall back to another ortho',()=>{for(const n of [3,4,5])assert.equal(selectAgroPreview(survey,[job(1),job(3,'processing'),job(4,'cancelled')],[result(1),result(3,3),result(4,4)],id(n)),null);});
test('latest completed without ortho does not silently use an older processing',()=>assert.equal(selectAgroPreview(survey,[job(2),job(1)],[result(1,1)]),null));
test('foreign survey jobs and results are excluded',()=>{assert.equal(selectAgroPreview(survey,[job(1,'completed',other)],[result(1)]),null);assert.equal(selectAgroPreview(survey,[job(1)],[result(1,1,{survey_id:other})]),null);});
test('no completed job is an explicit absence',()=>assert.equal(selectAgroPreview(survey,[job(1,'processing')],[result(1)]),null));
test('invalid, inverted and unsupported geographic bounds rejected',()=>{for(const invalid of [{...bounds,west:NaN},{...bounds,north:Infinity},{...bounds,east:bounds.west},{...bounds,south:bounds.north},{...bounds,west:-181},{...bounds,north:86},{...bounds,west:'-46.9'}])assert.equal(selectAgroPreview(survey,[job(1)],[result(1,1,{metadata:{bounds_wgs84:invalid}})]),null);});
test('non-ortho results, missing previews and invalid IDs rejected',()=>{for(const override of [{kind:'dsm'},{id:'../private-file'},{preview_url:null},{mime_type:'application/pdf'},{metadata:null}])assert.equal(selectAgroPreview(survey,[job(1)],[result(1,1,override)]),null);});
test('valid original preview is accepted without generating an external arbitrary URL',()=>{const a=selectAgroPreview(survey,[job(1)],[result(1,1,{preview_url:null,original_preview_url:'https://test.supabase.co/original.png'})]);assert.ok(a.url.startsWith('/api/processing-preview/'));});
test('results link opens a second tab and does not change the original view',()=>{const source=fs.readFileSync(path.resolve(__dirname,'../src/app/processamento/resultados/page.tsx'),'utf8');assert.match(source,/href=\{`\/agro\?levantamento=.*?#mapa-plantio`\} target="_blank" rel="noopener noreferrer"/);});

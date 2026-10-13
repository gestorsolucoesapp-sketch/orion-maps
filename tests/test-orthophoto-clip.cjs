const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const sharp=require('sharp');

function loadTs(file,dependencies={}){
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',js)((id)=>dependencies[id]||require(id),module,module.exports);
  return module.exports;
}
const geometry=loadTs('src/lib/orthophoto-clip.ts');
const server=loadTs('src/lib/server/orthophoto-clip.ts',{'@/lib/orthophoto-clip':geometry});
const bounds={west:-46.8501,east:-46.8499,south:-21.6001,north:-21.5999};
const points=[[-46.85005,-21.60005],[-46.84995,-21.60005],[-46.84995,-21.59995],[-46.85005,-21.59995]];

(async()=>{
  assert.equal(geometry.validateClipSpec({points,marginM:1}).marginM,1);
  for(const marginM of [0,.5,1,2,5])assert.equal(geometry.validateClipSpec({points,marginM}).marginM,marginM);
  const large=geometry.clipPixelGeometry(geometry.validateClipSpec({points,marginM:1e9}),bounds,200,200);
  assert.equal(large.coverageLimited,true);
  assert.ok(Number.isFinite(large.effectiveMarginM));
  assert.throws(()=>geometry.validateClipSpec({points:[points[0],points[2],points[1],points[3]],marginM:1}),/cruza/);
  assert.throws(()=>geometry.validateClipSpec({points,marginM:-1}),/margem/);
  assert.throws(()=>geometry.validateClipSpec({points:[points[0],points[0],points[2]],marginM:1}),/vértices/);
  const input=await sharp({create:{width:200,height:200,channels:4,background:{r:255,g:32,b:16,alpha:1}}}).png().toBuffer();
  const {png,width,height,bounds:cutBounds,worldFile}=await server.renderOrthophotoClip(input,bounds,{points,marginM:1},'download');
  assert.ok(width<200&&height<200,'rectangular extent must shrink');
  assert.ok(cutBounds.west>bounds.west&&cutBounds.east<bounds.east);
  assert.equal(worldFile.split('\n').filter(Boolean).length,6);
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const at=(x,y)=>[...data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4)];
  assert.equal(at(0,0)[3],0,'corner outside buffered polygon is transparent');
  assert.equal(at(Math.floor(width/2),Math.floor(height/2))[3],255,'parcel interior remains visible');
  let hidden=0,opaque=0;
  for(let i=0;i<data.length;i+=4){if(data[i+3]===0){assert.equal(data[i],0,'hidden red pixel must be erased');assert.equal(data[i+1],0);assert.equal(data[i+2],0);hidden++;}if(data[i+3]===255)opaque++;}
  assert.ok(hidden>0&&opaque>0);
  const noMargin=await server.renderOrthophotoClip(input,bounds,{points,marginM:0},'download');
  assert.ok(width>noMargin.width&&height>noMargin.height,'outward margin must grow the crop');
  const fiveMetres=await server.renderOrthophotoClip(input,bounds,{points,marginM:5},'download');
  assert.ok(fiveMetres.width>width&&fiveMetres.height>height,'larger requested margin must update exported pixels');
  const id='11111111-1111-4111-8111-111111111111',survey='22222222-2222-4222-8222-222222222222';
  const route=loadTs('src/app/api/orthophoto-clip/[id]/route.ts',{
    '@/lib/supabase/auth':{getCurrentAccessToken:async()=> 'test-token',getCurrentUser:async()=>({id:'33333333-3333-4333-8333-333333333333'})},
    '@/lib/supabase/config':{getSupabaseConfig:()=>({url:'https://trusted.example',publishableKey:'public-key'})},
    '@/lib/supabase/processing-results':{listProcessingResults:async()=>[{id,survey_id:survey,job_id:'44444444-4444-4444-8444-444444444444',kind:'orthophoto',storage_path:'33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/orthophoto/source.png',metadata:{bounds_wgs84:bounds},mime_type:'image/png'}]},
    '@/lib/server/orthophoto-clip':server,
  });
  const oldFetch=global.fetch;global.fetch=async(url)=>{assert.ok(String(url).startsWith('https://trusted.example/storage/'));return new Response(input,{headers:{'content-length':String(input.length)}});};
  try{
    const url=`http://local/api/orthophoto-clip/${id}?survey=${survey}&clip=${encodeURIComponent(JSON.stringify({points,marginM:1}))}&mode=download`;
    const response=await route.GET(new Request(url),{params:Promise.resolve({id})});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/png');
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.ok((await response.arrayBuffer()).byteLength>0);
    const invalid=await route.GET(new Request(url.replace('mode=download','mode=download').replace('marginM%22%3A1','marginM%22%3A-1')),{params:Promise.resolve({id})});
    assert.equal(invalid.status,422);
  }finally{global.fetch=oldFetch;}
  console.log('orthophoto clip: geometry, outward metres, transparency, hidden RGB, bounds, world file OK');
})().catch(error=>{console.error(error);process.exitCode=1;});

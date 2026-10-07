import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {encodeOrthophotoPreview,getProcessingPreview} from '../src/lib/server/processing-preview.ts';
import {orthophotoPreviewUrl} from '../src/lib/orthophoto-preview-url.ts';
const owner='11111111-1111-4111-8111-111111111111',job='22222222-2222-4222-8222-222222222222';
const config={url:'https://fixture.invalid',publishableKey:'test-only'};
const id=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
const row=n=>({id:id(n),owner_id:owner,job_id:job,kind:'orthophoto',storage_path:owner+'/'+job+'/orthophoto/image.png',size_bytes:1000,created_at:'2026-01-01T00:00:00Z'});
const input=await sharp({create:{width:3000,height:1500,channels:4,background:{r:80,g:120,b:40,alpha:.5}}}).png().toBuffer();

test('preview preserves full aspect, alpha, original buffer and maximum 2400px',async()=>{
 const before=Buffer.from(input);const preview=await encodeOrthophotoPreview(input);const metadata=await sharp(preview.data).metadata();
 assert.equal(metadata.format,'webp');assert.equal(metadata.width,2400);assert.equal(metadata.height,1200);assert.equal(metadata.hasAlpha,true);
 assert.deepEqual(before,input);assert.ok(preview.data.length<4*1024*1024);assert.equal(preview.sourceBytes,input.length);
});
test('missing login or malformed IDs are rejected before any storage read',async()=>{
 const unexpected=()=>{throw Error('Unexpected network access')};
 await assert.rejects(()=>getProcessingPreview(id(1),'',config,unexpected),e=>e.status===401);
 await assert.rejects(()=>getProcessingPreview('../secret','test',config,unexpected),e=>e.status===400);
});
test('RLS exclusion and expired sessions never trigger an image request',async()=>{
 let calls=0;
 await assert.rejects(()=>getProcessingPreview(id(2),'test',config,async()=>{calls++;return Response.json([])}),e=>e.status===404);
 await assert.rejects(()=>getProcessingPreview(id(3),'test',config,async()=>{calls++;return new Response('',{status:401})}),e=>e.status===401);
 assert.equal(calls,2);
});
test('no SSRF or cross-owner storage path can be requested',async()=>{
 for(const path of ['https://example.invalid/secret.png',owner+'/'+job+'/orthophoto/../secret.png','other/'+job+'/orthophoto/image.png']){
  let calls=0;await assert.rejects(()=>getProcessingPreview(id(4),'test',config,async()=>{calls++;return Response.json([{...row(4),storage_path:path}])}),e=>e.status===415);assert.equal(calls,1);
 }
});
test('simultaneous map and thumbnail share one conversion; RLS is checked again on cache hit',async()=>{
 let database=0,storage=0,allow=true;
 const fetcher=async(url,init)=>{
  assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer test');
  if(url.includes('/rest/v1/')){database++;return Response.json(allow?[row(5)]:[])}
  storage++;assert.ok(url.startsWith(config.url+'/storage/v1/object/authenticated/processing-results/'));
  await new Promise(resolve=>setTimeout(resolve,30));return new Response(input,{headers:{'Content-Type':'image/png'}});
 };
 const [a,b]=await Promise.all([getProcessingPreview(id(5),'test',config,fetcher),getProcessingPreview(id(5),'test',config,fetcher)]);
 assert.equal(a,b);assert.equal(storage,1);assert.equal(database,2);
 const c=await getProcessingPreview(id(5),'test',config,fetcher);assert.equal(c,a);assert.equal(database,3);assert.equal(storage,1);
 allow=false;await assert.rejects(()=>getProcessingPreview(id(5),'another-account',config,async url=>{assert.ok(url.includes('/rest/v1/'));return Response.json([])}),e=>e.status===404);
});
test('failed upstream image is an explicit error and never success-cached',async()=>{
 const fetcher=async url=>url.includes('/rest/v1/')?Response.json([row(6)]):new Response('',{status:503});
 await assert.rejects(()=>getProcessingPreview(id(6),'test',config,fetcher),e=>e.status===502);
 await assert.rejects(()=>getProcessingPreview(id(6),'test',config,fetcher),e=>e.status===502);
});
test('oversized files are rejected before downloading',async()=>{
 let calls=0;await assert.rejects(()=>getProcessingPreview(id(7),'test',config,async()=>{calls++;return Response.json([{...row(7),size_bytes:170*1024*1024}])}),e=>e.status===413);assert.equal(calls,1);
});
test('stable private preview URL does not modify any original download',()=>{
 const item={...row(8),preview_url:'https://fixture.invalid/original.png',download_url:'https://fixture.invalid/original.png'};
 const before=JSON.stringify(item),a=orthophotoPreviewUrl(item),b=orthophotoPreviewUrl(item);
 assert.equal(a,b);assert.ok(a.startsWith('/api/processing-preview/'));assert.equal(JSON.stringify(item),before);
});

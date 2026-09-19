import test from 'node:test';
import assert from 'node:assert/strict';
import {readDrafts,validateDraft} from '../src/app/processamento/drafts.ts';
const draft={version:1,id:'11111111-1111-4111-8111-111111111111',surveyId:'22222222-2222-4222-8222-222222222222',title:'Voo de teste',product:'complete',quality:'high',resolution:5,gcp:true,notes:'Conferir pontos',savedAt:'2026-09-19T12:00:00Z'};
test('draft roundtrip retains product, quality and GCP intention',()=>assert.deepEqual(readDrafts(JSON.stringify([draft])),[draft]));
test('malformed existing data is rejected rather than silently replaced',()=>{for(const raw of ['{','{}','[{}]'])assert.throws(()=>readDrafts(raw));});
test('reject invalid products, extreme resolutions and external identifiers',()=>{for(const patch of [{product:'paid'},{resolution:0},{resolution:Infinity},{resolution:101},{surveyId:'https://external.example'},{gcp:'true'},{quality:'unknown'},{title:''}])assert.throws(()=>validateDraft({...draft,...patch}));});
test('empty browser storage is a new list',()=>assert.deepEqual(readDrafts(null),[]));

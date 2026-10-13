const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ts=require('typescript');
const sharp=require('sharp');

function loadTs(file,dependencies={}){
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};new Function('require','module','exports',js)(id=>dependencies[id]||require(id),module,module.exports);return module.exports;
}
const geometry=loadTs(path.join(__dirname,'../src/lib/orthophoto-clip.ts'));
const server=loadTs(path.join(__dirname,'../src/lib/server/orthophoto-clip.ts'),{'@/lib/orthophoto-clip':geometry});
const [source,aux,output]=process.argv.slice(2);
if(!source||!aux||!output)throw Error('Usage: node tests/qa-real-orthophoto.cjs SOURCE_PNG AUX_XML OUTPUT_DIRECTORY');

(async()=>{
  const original=fs.readFileSync(source),initialHash=crypto.createHash('sha256').update(original).digest('hex');
  const info=await sharp(original).metadata();
  const xml=fs.readFileSync(aux,'utf8');
  const transform=xml.match(/<GeoTransform>([^<]+)<\/GeoTransform>/)?.[1].split(',').map(Number);
  assert.ok(transform&&transform.length===6&&transform.every(Number.isFinite));
  assert.equal(transform[2],0);assert.equal(transform[4],0);
  assert.ok(transform[1]>0&&transform[5]<0);
  const bounds={west:transform[0],north:transform[3],east:transform[0]+info.width*transform[1],south:transform[3]+info.height*transform[5]};
  const point=(u,v)=>[bounds.west+u*(bounds.east-bounds.west),bounds.south+v*(bounds.north-bounds.south)];
  // A reproducible inset test polygon, deliberately not a claimed property boundary.
  const spec={points:[point(.22,.2),point(.68,.15),point(.82,.47),point(.63,.78),point(.22,.72)],marginM:1};
  const cut=await server.renderOrthophotoClip(original,bounds,spec,'download');
  const {data,info:cutInfo}=await sharp(cut.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=0,opaque=0,hiddenRgb=0;
  for(let i=0;i<data.length;i+=4){if(data[i+3]===0){transparent++;if(data[i]||data[i+1]||data[i+2])hiddenRgb++;}else if(data[i+3]===255)opaque++;}
  assert.ok(transparent>0&&opaque>0);assert.equal(hiddenRgb,0);
  assert.ok(cut.width<info.width&&cut.height<info.height);
  const values=cut.worldFile.trim().split(/\r?\n/).map(Number);
  assert.equal(values.length,6);
  assert.ok(Math.abs((values[4]-values[0]/2)-cut.bounds.west)<1e-11);
  assert.ok(Math.abs((values[5]-values[3]/2)-cut.bounds.north)<1e-11);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),initialHash);
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'ortofoto-recortada.png'),cut.png);
  fs.writeFileSync(path.join(output,'ortofoto-recortada.pgw'),cut.worldFile);
  fs.writeFileSync(path.join(output,'ortofoto-recortada.prj'),'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]\n');
  const report={source:path.basename(source),sourceSha256:initialHash,sourcePixels:[info.width,info.height],cutPixels:[cut.width,cut.height],boundsWgs84:cut.bounds,marginM:1,transparentPixels:transparent,opaquePixels:opaque,hiddenRgbPixels:hiddenRgb,polygon:'QA inset pentagon; not a surveyed property boundary'};
  fs.writeFileSync(path.join(output,'verificacao.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(output,'relatorio-qa.html'),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>QA local do recorte</title><style>body{font:14px Arial;margin:20mm;color:#162b26}h1{font-size:21px}img{display:block;max-width:100%;max-height:220mm;object-fit:contain;border:1px solid #aaa}p{line-height:1.5}</style><h1>Verificação local de recorte da ortofoto</h1><p>Polígono de ensaio interno, margem de 1 metro para fora. Não representa a divisa real do terreno.</p><img src="ortofoto-recortada.png" alt="Ortofoto real recortada"><p>Pixels transparentes: ${transparent.toLocaleString('pt-BR')}. Pixels RGB ocultos fora do recorte: ${hiddenRgb}. PNG acompanhado por PGW e PRJ WGS84.</p></html>`);
  console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const React=require("react");
const {renderToStaticMarkup}=require("react-dom/server");

function load(file,dependencies={}){
  const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const loaded={exports:{}};
  new Function("require","module","exports",js)((id)=>dependencies[id]||require(id),loaded,loaded.exports);
  return loaded.exports;
}

const geometry=load("src/lib/orthophoto-clip.ts");
const flow=load("src/lib/orthophoto-clip-flow.ts",{"./orthophoto-clip":geometry});
const points=[[-46.85005,-21.60005],[-46.84995,-21.60005],[-46.84995,-21.59995],[-46.85005,-21.59995]];
let state=flow.initialClipFlow();
assert.equal(state.applied,null,"a fresh project starts with the complete orthophoto");
assert.equal(state.marginText,"0");
assert.equal(flow.clipFlowReducer(state,{type:"apply"}),state,"applying without an editing session has no effect");
state=flow.clipFlowReducer(state,{type:"draw"});
assert.equal(state.editing,true);
assert.equal(state.drawing,true);
assert.equal(state.applied,null);
state=flow.clipFlowReducer(state,{type:"points",points});
assert.equal(state.applied,null,"drawing alone cannot activate a crop");
state=flow.clipFlowReducer(state,{type:"margin",value:"bad"});
assert.equal(flow.clipFlowReducer(state,{type:"apply"}),state,"invalid margins cannot be applied");
state=flow.clipFlowReducer(state,{type:"margin",value:"0"});
state=flow.clipFlowReducer(state,{type:"apply"});
assert.deepEqual(state.applied,{points,marginM:0},"only explicit apply uses the selected area");
assert.equal(state.editing,false);
const previous=state.applied;
state=flow.clipFlowReducer(state,{type:"edit"});
state=flow.clipFlowReducer(state,{type:"points",points:points.slice(0,3)});
assert.deepEqual(state.applied,previous,"unapplied edits cannot change exported pixels");
state=flow.clipFlowReducer(state,{type:"cancel"});
assert.deepEqual(state.applied,previous,"cancel restores the prior crop");
state=flow.clipFlowReducer(state,{type:"draw"});
assert.deepEqual(state.applied,previous,"new drawing leaves the prior export intact");
state=flow.clipFlowReducer(state,{type:"points",points});
state=flow.clipFlowReducer(state,{type:"margin",value:"1,5"});
state=flow.clipFlowReducer(state,{type:"apply"});
assert.equal(state.applied.marginM,1.5,"optional margin is applied only to the chosen polygon");
state=flow.clipFlowReducer(state,{type:"restore"});
assert.equal(state.applied,null,"restore shows the original again");
assert.equal(state.marginText,"0");
assert.equal(flow.initialClipFlow().applied,null,"reopening does not persist a crop");

const MapStub=props=>React.createElement("div",{"data-map-mode":props.privateMode?"private":"full","data-clip-points":JSON.stringify(props.clipPoints)});
const ProcessingResults=load("src/app/processamento/processing-results.tsx",{
  "next/dynamic":{__esModule:true,default:()=>MapStub},
  "@/lib/orthophoto-preview-url":{orthophotoPreviewUrl:()=>"/original-preview.png"},
  "@/lib/orthophoto-clip":geometry,
  "@/lib/orthophoto-clip-flow":flow,
  "@/lib/processing-fresh-url":{freshProcessingUrl:async()=>"/original-download.png"},
}).default;
const ortho={id:"ortho-id",survey_id:"survey-id",kind:"orthophoto",preview_url:"/original-preview.png",storage_path:"source.png",mime_type:"image/png",size_bytes:100,metadata:{bounds_wgs84:{west:-46.8501,east:-46.8499,south:-21.6001,north:-21.5999}}};
const html=renderToStaticMarkup(React.createElement(ProcessingResults,{
  results:[ortho],surveyId:"survey-id",planBoundary:{name:"Plano",points},
}));
assert.match(html,/data-map-mode="full"/,"a saved plan must not enable private mode");
assert.match(html,/data-clip-points="\[\]"/,"the saved plan must not seed crop vertices");
assert.match(html,/original-preview\.png/,"the initial view uses the complete original preview");
assert.doesNotMatch(html,/api\/orthophoto-clip/,"no crop URL is requested on opening");
assert.doesNotMatch(html,/privado=1/,"the initial PDF uses the original");
assert.match(html,/Ortofoto original completa\. Nenhum recorte aplicado/);
assert.doesNotMatch(html,/Restaurar contorno do plano/);
console.log("orthophoto clip flow: original default, independent drawing, apply, cancel, margin and restore OK");

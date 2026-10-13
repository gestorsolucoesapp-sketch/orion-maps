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
assert.deepEqual(flow.clipDrawingGeoJson([]).features,[],"no invalid zero-point LineString");
assert.deepEqual(flow.clipDrawingGeoJson(points.slice(0,1)).features,[],"the first vertex is shown by its marker");
assert.equal(flow.clipDrawingGeoJson(points.slice(0,2)).features[0].geometry.type,"LineString");
assert.equal(flow.clipDrawingGeoJson(points.slice(0,3)).features[0].geometry.type,"Polygon");
assert.deepEqual(flow.clipDrawingGeoJson(points.slice(0,3)).features[0].geometry.coordinates[0].at(-1),points[0]);
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

// Run the client component with a small hook harness so clicks and map callbacks
// can be exercised without a browser or a real imagery service.
const slots=[];
let cursor=0;
const same=(a,b)=>a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const hooks={
  useState(initial){
    const index=cursor++;
    if(!(index in slots))slots[index]=typeof initial==="function"?initial():initial;
    return [slots[index],next=>{slots[index]=typeof next==="function"?next(slots[index]):next;}];
  },
  useReducer(reducer,arg,initial){
    const index=cursor++;
    if(!(index in slots))slots[index]=initial?initial(arg):arg;
    return [slots[index],action=>{slots[index]=reducer(slots[index],action);}];
  },
  useMemo(factory,deps){
    const index=cursor++;
    if(!(index in slots)||!same(slots[index].deps,deps))slots[index]={deps,value:factory()};
    return slots[index].value;
  },
  useCallback(callback,deps){return hooks.useMemo(()=>callback,deps);},
};
const InteractiveResults=load("src/app/processamento/processing-results.tsx",{
  react:hooks,
  "next/dynamic":{__esModule:true,default:()=>MapStub},
  "@/lib/orthophoto-preview-url":{orthophotoPreviewUrl:()=>"/original-preview.png"},
  "@/lib/orthophoto-clip":geometry,
  "@/lib/orthophoto-clip-flow":flow,
  "@/lib/processing-fresh-url":{freshProcessingUrl:async()=>"/original-download.png"},
}).default;
const props={results:[ortho],surveyId:"survey-id",planBoundary:{name:"Plano",points}};
const render=()=>{cursor=0;return InteractiveResults(props);};
function find(node,predicate){
  if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}return null;}
  if(!node||typeof node!=="object")return null;
  if(predicate(node))return node;
  return find(node.props?.children,predicate);
}
const mapOf=tree=>find(tree,node=>node.type===MapStub);
const button=(tree,label)=>find(tree,node=>node.type==="button"&&node.props.children===label);
let tree=render(),map=mapOf(tree);
const originalResults=map.props.results;
const originalPointHandler=map.props.onClipPointsChange;
button(tree,"Desenhar novo contorno").props.onClick();
tree=render();map=mapOf(tree);
assert.equal(map.props.results,originalResults,"starting drawing must not recreate MapLibre");
assert.equal(map.props.onClipPointsChange,originalPointHandler,"drawing keeps the map click handler stable");
assert.equal(map.props.privateMode,false);
assert.equal(map.props.clipEditing,true);
assert.equal(map.props.clipDrawing,true);
assert.equal(find(tree,node=>node.props?.role==="alert"),null,"no error before drawing points");
for(let index=0;index<3;index++){
  map.props.onClipPointsChange(points.slice(0,index+1));
  tree=render();map=mapOf(tree);
  assert.equal(map.props.results,originalResults,"each point must preserve the map and loaded imagery");
  assert.equal(map.props.onClipPointsChange,originalPointHandler);
  assert.equal(map.props.clipPoints.length,index+1);
  assert.equal(map.props.privateMode,false,"drawing never applies a crop");
}
button(tree,"Cancelar edição").props.onClick();
tree=render();map=mapOf(tree);
assert.equal(map.props.clipPoints.length,0);
assert.equal(map.props.privateMode,false);
button(tree,"Desenhar novo contorno").props.onClick();
tree=render();map=mapOf(tree);
assert.equal(map.props.results,originalResults,"drawing again after cancel reuses the original image layer");
map.props.onClipPointsChange(points);
tree=render();
assert.equal(button(tree,"Aplicar recorte").props.disabled,false);
button(tree,"Aplicar recorte").props.onClick();
tree=render();map=mapOf(tree);
assert.equal(map.props.privateMode,true);
assert.match(map.props.clipUrl,/api\/orthophoto-clip/);
button(tree,"Editar recorte aplicado").props.onClick();
tree=render();map=mapOf(tree);
assert.equal(map.props.privateMode,false,"editing uses the full original as its canvas");
assert.equal(map.props.clipEditing,true);
button(tree,"Cancelar edição").props.onClick();
tree=render();map=mapOf(tree);
assert.equal(map.props.privateMode,true,"cancel restores the previously applied crop");
button(tree,"Restaurar ortofoto original").props.onClick();
tree=render();map=mapOf(tree);
assert.equal(map.props.privateMode,false);
assert.equal(map.props.clipUrl,null);
console.log("orthophoto clip flow: original default, independent drawing, apply, cancel, margin and restore OK");

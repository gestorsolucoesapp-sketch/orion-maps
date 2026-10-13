import {validateClipSpec,type ClipPoint,type ClipSpec} from "./orthophoto-clip";

export type ClipFlowState={
  points:ClipPoint[];
  marginText:string;
  applied:ClipSpec|null;
  editing:boolean;
  drawing:boolean;
};

export type ClipFlowAction=
  |{type:"draw"}
  |{type:"edit"}
  |{type:"points";points:ClipPoint[]}
  |{type:"margin";value:string}
  |{type:"toggleDrawing"}
  |{type:"undo"}
  |{type:"apply"}
  |{type:"cancel"}
  |{type:"restore"};

export function initialClipFlow():ClipFlowState{
  return {points:[],marginText:"0",applied:null,editing:false,drawing:false};
}

export function parseClipMargin(text:string):number{
  const value=text.trim();
  return /^\d+(?:[,.]\d+)?$/.test(value)?Number(value.replace(",",".")):Number.NaN;
}

export function clipDrawingGeoJson(points:ClipPoint[]):GeoJSON.FeatureCollection{
  if(points.length<2)return {type:"FeatureCollection",features:[]};
  const geometry:GeoJSON.Geometry=points.length>=3
    ?{type:"Polygon",coordinates:[[...points,points[0]]]}
    :{type:"LineString",coordinates:points};
  return {type:"FeatureCollection",features:[{type:"Feature",properties:{},geometry}]};
}

export function clipFlowReducer(state:ClipFlowState,action:ClipFlowAction):ClipFlowState{
  switch(action.type){
    case "draw":return {...state,points:[],marginText:"0",editing:true,drawing:true};
    case "edit":
      return state.applied?{...state,points:state.applied.points.map(point=>[...point] as ClipPoint),marginText:String(state.applied.marginM),editing:true,drawing:false}:state;
    case "points":return state.editing?{...state,points:action.points}:state;
    case "margin":return state.editing?{...state,marginText:action.value}:state;
    case "toggleDrawing":return state.editing?{...state,drawing:!state.drawing}:state;
    case "undo":return state.editing?{...state,points:state.points.slice(0,-1)}:state;
    case "apply":{
      if(!state.editing)return state;
      try{
        const spec=validateClipSpec({points:state.points,marginM:parseClipMargin(state.marginText)});
        return {...state,applied:spec,points:spec.points.map(point=>[...point] as ClipPoint),editing:false,drawing:false};
      }catch{return state;}
    }
    case "cancel":return {...state,points:state.applied?.points.map(point=>[...point] as ClipPoint)||[],marginText:String(state.applied?.marginM??0),editing:false,drawing:false};
    case "restore":return initialClipFlow();
  }
}

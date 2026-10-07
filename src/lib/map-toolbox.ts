export type MapMeasureTool = "distance" | "area" | "profile" | "slope";
export type TerrainToolAction = "area" | "profile" | "fix" | "clear" | "undo" | "redo" | "retry";
export type TerrainToolCommand = {sequence:number;action:TerrainToolAction};
export type TerrainToolFeedback = {
  state:"idle"|"busy"|"ready"|"error";
  title:string;detail:string;canFix:boolean;canClear:boolean;canUndo:boolean;canRedo:boolean;count:number;
};
export const EMPTY_TERRAIN_FEEDBACK:TerrainToolFeedback={state:"idle",title:"",detail:"",canFix:false,canClear:false,canUndo:false,canRedo:false,count:0};

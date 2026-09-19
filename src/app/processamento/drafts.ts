export const products = [
 {id:'ortho',name:'Ortofoto + relatório',description:'Mapa ortorretificado e relatório de qualidade.'},
 {id:'elevation',name:'Ortofoto + MDT / MDS',description:'Relatório e modelos de terreno e superfície.'},
 {id:'cloud',name:'Ortofoto + nuvem LAZ',description:'Relatório e nuvem de pontos georreferenciada.'},
 {id:'complete',name:'Pacote completo',description:'Ortofoto, relatório, MDT, MDS e nuvem LAZ.'},
] as const;
export type Draft={version:1;id:string;surveyId:string;title:string;product:string;quality:string;resolution:number;gcp:boolean;notes:string;savedAt:string};
export function validateDraft(value:unknown):Draft{
 const d=value as Draft;
 if(!d||d.version!==1||typeof d.id!=='string'||!/^[0-9a-f-]{36}$/i.test(d.id)||typeof d.surveyId!=='string'||!/^[0-9a-f-]{36}$/i.test(d.surveyId)||typeof d.title!=='string'||d.title.trim().length<2||d.title.length>120||!products.some(p=>p.id===d.product)||!['medium','high'].includes(d.quality)||!Number.isFinite(d.resolution)||d.resolution<0.5||d.resolution>100||typeof d.gcp!=='boolean'||typeof d.notes!=='string'||d.notes.length>3000||typeof d.savedAt!=='string'||!Number.isFinite(Date.parse(d.savedAt)))throw new Error('Revise o nome, o produto e a resolução (0,5 a 100 cm/px).');
 return d;
}
export function readDrafts(raw:string|null):Draft[]{
 const items:unknown=JSON.parse(raw||'[]');
 if(!Array.isArray(items)||items.length>100)throw new Error('Não foi possível ler os rascunhos salvos. Nenhum dado foi alterado.');
 return items.map(validateDraft);
}

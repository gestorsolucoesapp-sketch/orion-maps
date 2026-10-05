"use server";

import {getCurrentAccessToken,getCurrentUser} from "@/lib/supabase/auth";
import {requireSurvey} from "@/lib/supabase/surveys";
import {createProcessingJob} from "@/lib/supabase/processing-jobs";

type QueueInput={
  surveyId:string;
  inputImageCount:number;
  product:string;
  quality:string;
  resolution:number;
  gcp:boolean;
  notes:string;
};

const productMap:Record<string,string[]>={
  ortho:["orthophoto","report"],
  elevation:["orthophoto","dsm","dtm","contours","hillshade","slope","hypsometry","report"],
  cloud:["orthophoto","point_cloud","report"],
  complete:["orthophoto","dsm","dtm","point_cloud","contours","hillshade","slope","hypsometry","report"],
};

export async function queueProcessing(input:QueueInput){
  const [user,token]=await Promise.all([getCurrentUser(),getCurrentAccessToken()]);
  if(!user||!token)return {ok:false,error:"Sua sessão expirou. Entre novamente."};
  try{
    await requireSurvey(input.surveyId,token);
    if(!Number.isInteger(input.inputImageCount)||input.inputImageCount<3||input.inputImageCount>5000)throw new Error("Quantidade de imagens inválida.");
    if(!productMap[input.product])throw new Error("Produto de processamento inválido.");
    if(!["medium","high"].includes(input.quality))throw new Error("Qualidade inválida.");
    if(!Number.isFinite(input.resolution)||input.resolution<0.5||input.resolution>100)throw new Error("Resolução inválida.");

    const job=await createProcessingJob(token,{
      survey_id:input.surveyId,
      input_image_count:input.inputImageCount,
      config:{
        preset:"orion_complete_v1",
        resume:true,
        quality:input.quality==="high"?"high":"balanced",
        products:productMap[input.product],
        target_crs:"auto_utm_sirgas2000",
        generate_cog:true,
        generate_laz:true,
        contour_intervals_m:[0.5,1,2,5],
        orthophoto_resolution_cm:input.resolution,
        gcp_requested:input.gcp,
        notes:input.notes.slice(0,3000),
        requested_from:"orion_web",
      },
    });
    return {ok:true,jobId:job.id};
  }catch(e){
    const raw=e instanceof Error?e.message:"Não foi possível criar a tarefa.";
    const duplicate=/duplicate|unique|conflict|active/i.test(raw);
    return {ok:false,error:duplicate?"Já existe um processamento ativo para este levantamento. Aguarde ou atualize a página.":raw};
  }
}

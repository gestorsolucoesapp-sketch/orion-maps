"use server";
import {getCurrentUser} from '@/lib/supabase/auth';
import {inspectEngine,type EngineStatus} from './engine-client';
export async function checkProcessingEngine():Promise<EngineStatus>{
 const user=await getCurrentUser();
 if(!user)throw new Error("Entre na sua conta para verificar a conexão.");
 // Destination is configured by the deployment owner, never accepted from the browser.
 return inspectEngine(process.env.NODEODM_URL,process.env.NODEODM_TOKEN);
}

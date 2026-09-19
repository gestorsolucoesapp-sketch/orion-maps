import Link from 'next/link';
import Image from 'next/image';
import {redirect} from 'next/navigation';
import {getCurrentUser,getCurrentAccessToken} from '@/lib/supabase/auth';
import {listSurveys,listImages,type Survey,type SurveyImage} from '@/lib/supabase/surveys';
import ProcessingWorkspace from './workspace';
import '../waypoints/waypoints.css';
export default async function ProcessingPage({searchParams}:{searchParams:Promise<{levantamento?:string;rascunho?:string}>}){
 const [user,token,query]=await Promise.all([getCurrentUser(),getCurrentAccessToken(),searchParams]);
 if(!user||!token)redirect('/entrar?retorno=%2Fprocessamento');
 let surveys:Survey[]=[],images:SurveyImage[]=[],error='',imageError='';
 try{surveys=await listSurveys(token);}catch{error='Não foi possível carregar seus levantamentos. Atualize a página para tentar novamente.';}
 const active=surveys.find(s=>s.id===query.levantamento);
 if(active)try{images=await listImages(active.id,user.id,token);}catch{imageError='Não foi possível consultar as imagens. Atualize a página antes de preparar o pedido.';}
 return <div className="flight-app"><aside className="flight-sidebar"><Link className="flight-brand" href="/painel"><Image src="/orion-drone-concept.png" width={48} height={48} className="brand-image" alt="Símbolo de drone Orion"/><span>ORION<small>MAPS / FIELD SYSTEMS</small></span></Link><div className="sidebar-label">ÁREA DE TRABALHO</div><nav><Link href="/waypoints"><span>01</span>Waypoint KMZ</Link><Link href="/gsd"><span>02</span>Calculadora GSD</Link><Link href="/painel"><span>03</span>Levantamentos</Link><Link href="/processamento" aria-current="page"><span>04</span>Processamento</Link></nav></aside><main className="flight-main"><header className="flight-topbar"><span>IMAGENS / PROCESSAMENTO</span><Link href="/painel">Voltar ao painel ↗</Link></header>{error?<p role="alert" className="flight-error">{error}</p>:<ProcessingWorkspace key={active?.id||'none'} userId={user.id} surveys={surveys} active={active} images={images} imageError={imageError} draftId={query.rascunho}/>}</main></div>;
}

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccessToken, getCurrentUser } from "@/lib/supabase/auth";
import { listImages, listSurveys, type Survey, type SurveyImage } from "@/lib/supabase/surveys";
import { listProcessingJobs } from "@/lib/supabase/processing-jobs";
import { listProcessingDevices } from "@/lib/supabase/processing-devices";
import { signOutAction } from "./actions";
import { ImageWorkspace, SurveyForm, SurveySearch, type SurveyStatus } from "./workspace";

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ levantamento?: string; novo?: string }> }) {
  const [user, token, query] = await Promise.all([getCurrentUser(), getCurrentAccessToken(), searchParams]);
  if (!user || !token) redirect("/entrar");

  let surveys: Survey[] = [], images: SurveyImage[] = [], error = "", imageError = "";
  try { surveys = await listSurveys(token); } catch { error = "Não foi possível carregar os levantamentos. Atualize a página em instantes."; }

  const active = surveys.find(survey => survey.id === query.levantamento);
  if (active) {
    try { images = await listImages(active.id, user.id, token); }
    catch { imageError = "Não foi possível consultar as fotos. Atualize a página antes de enviar arquivos."; }
  }

  const statusEntries = await Promise.all(surveys.map(async survey => {
    try {
      const jobs = await listProcessingJobs(survey.id, token);
      const latest = jobs[0];
      let status: SurveyStatus = { status: "none", progress: 0, resultCount: 0 };
      if (latest) {
        if (latest.status === "completed") status = { status: "completed", progress: 100, resultCount: 1 };
        else if (latest.status === "error") status = { status: "error", progress: latest.progress, resultCount: 0 };
        else if (latest.status === "queued") status = { status: "queued", progress: latest.progress, resultCount: 0 };
        else if (latest.status !== "cancelled") status = { status: "processing", progress: latest.progress, resultCount: 0 };
      }
      return [survey.id, status] as const;
    } catch {
      return [survey.id, { status: "none", progress: 0, resultCount: 0 } satisfies SurveyStatus] as const;
    }
  }));
  const statuses = Object.fromEntries(statusEntries) as Record<string, SurveyStatus>;

  let motorOnline = false;
  try {
    const devices = await listProcessingDevices(token);
    motorOnline = devices.some(device => device.enabled && device.last_seen && Date.now() - new Date(device.last_seen).getTime() < 90_000);
  } catch {}

  const activeStatus = active ? statuses[active.id] : undefined;
  const activeResultsHref = active ? `/processamento/resultados?levantamento=${active.id}` : "/processamento";
  const activeProductsHref = active ? `/processamento?levantamento=${active.id}` : "/processamento";

  return <main className="min-h-screen bg-[#edf3ea] text-slate-900">
    <div className="mx-auto max-w-[1460px] px-4 pb-10 sm:px-7 lg:px-9">
      <header className="print:hidden">
        <div className="mt-4 overflow-hidden rounded-[28px] bg-[#071b20] text-white shadow-[0_14px_36px_rgba(10,45,31,.18)]">
          <div className="relative flex min-h-[132px] items-center justify-between gap-5 px-5 py-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[#0d2a31]">
                <Image src="/orion-drone-concept.png" width={64} height={64} alt="Orion Maps Drones" className="h-14 w-14 object-contain"/>
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold tracking-[.2em] sm:text-3xl">ORION</div>
                <div className="mt-1 text-xs font-semibold tracking-[.45em] text-sky-300">MAPS · DRONES</div>
                <div className="mt-2 text-xs text-white/60">Mapeamento de precisão</div>
              </div>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <span className="max-w-56 truncate text-xs text-white/55">{user.email}</span>
              <form action={signOutAction}><button className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white">Sair</button></form>
            </div>
          </div>
        </div>

        <div className="sticky top-2 z-30 -mt-4 mx-3 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur sm:mx-6">
          <nav className="grid grid-cols-3 gap-1 text-center text-sm font-semibold">
            <Link href="/painel" className="rounded-xl bg-emerald-800 px-3 py-3 text-white">Levantamentos</Link>
            <Link href={activeProductsHref} className="rounded-xl px-3 py-3 text-slate-600 hover:bg-slate-50">Produtos</Link>
            <Link href={activeResultsHref} className="rounded-xl px-3 py-3 text-slate-600 hover:bg-slate-50">Resultados</Link>
          </nav>
        </div>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-4 py-7 print:hidden">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Projetos de campo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Seus levantamentos.</h1>
          <p className="mt-2 text-sm text-slate-600">Fotos, processamento e resultados organizados por área.</p>
        </div>
        <Link href="/painel?novo=1" className="rounded-2xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white shadow-sm">+ Novo levantamento</Link>
      </section>

      {error ? <p role="alert" className="rounded-2xl bg-red-50 p-5 text-red-800">{error}</p> : <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="print:hidden">
          <div className={`mb-4 flex items-center justify-between rounded-2xl border p-4 ${motorOnline?"border-emerald-200 bg-emerald-50":"border-amber-200 bg-amber-50"}`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Motor de fotogrametria</p>
              <p className="mt-1 text-xs text-slate-600">{motorOnline?"Processador local conectado":"Processador local offline"}</p>
            </div>
            <span className={`h-3 w-3 shrink-0 rounded-full ${motorOnline?"bg-emerald-600":"bg-amber-500"}`}/>
          </div>

          <div className="mb-4 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-700">Levantamentos</h2>
            <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">{surveys.length}</span>
          </div>

          <SurveySearch surveys={surveys} activeId={active?.id} statuses={statuses}/>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
          {query.novo === "1" ? <div className="p-5 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Novo levantamento</p>
            <h2 className="mb-7 mt-2 text-2xl font-semibold">Dê um nome à próxima área.</h2>
            <SurveyForm />
          </div> : active ? <>
            <div className="border-b border-slate-100 bg-[#fbfcfa] p-5 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Levantamento</p>
                  <h2 className="mt-2 break-words text-3xl font-semibold">{active.name}</h2>
                  <p className="mt-3 text-sm text-slate-500">⌖ {active.location || "Local a definir"} · {active.drone || "Drone a definir"} · {active.flight_date?.split("-").reverse().join("/") || "Data a definir"}</p>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  {activeStatus?.status === "completed" && <Link href={activeResultsHref} className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white">Ver resultados →</Link>}
                  <Link href={activeProductsHref} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Produtos</Link>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5 text-center text-sm font-semibold print:hidden">
                <span className="rounded-xl bg-white px-3 py-3 text-emerald-800 shadow-sm">Projeto</span>
                <Link href={activeProductsHref} className="rounded-xl px-3 py-3 text-slate-500">Produtos</Link>
                <Link href={activeResultsHref} className="rounded-xl px-3 py-3 text-slate-500">Resultados</Link>
              </div>
            </div>

            <div className="p-5 sm:p-8">
              {active.notes && <p className="mb-5 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{active.notes}</p>}
              <details className="mb-6 rounded-2xl border border-slate-200 p-4 print:hidden">
                <summary className="cursor-pointer text-sm font-semibold">Editar informações do levantamento</summary>
                <div className="pt-5"><SurveyForm key={active.id} survey={active}/></div>
              </details>

              {imageError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{imageError}</p> : <ImageWorkspace key={active.id} survey={active} images={images}/>}

              <div className="mt-7 grid gap-3 sm:grid-cols-2 print:hidden">
                <Link href={activeProductsHref} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Produtos</span>
                  <strong className="mt-2 block text-lg">Processamento e arquivos →</strong>
                  <span className="mt-1 block text-sm text-slate-500">Ortofoto, DTM, DSM, curvas e nuvem de pontos.</span>
                </Link>
                <Link href={activeResultsHref} className={`rounded-2xl p-5 ${activeStatus?.status==="completed"?"bg-emerald-900 text-white":"border border-slate-200 bg-white"}`}>
                  <span className={`text-xs font-semibold uppercase tracking-widest ${activeStatus?.status==="completed"?"text-emerald-200":"text-slate-500"}`}>Resultados</span>
                  <strong className="mt-2 block text-lg">{activeStatus?.status==="completed"?"Abrir mapa e relatório →":"Ainda não concluído"}</strong>
                  <span className={`mt-1 block text-sm ${activeStatus?.status==="completed"?"text-emerald-100/80":"text-slate-500"}`}>{activeStatus?.status==="completed"?"Visualize as camadas e exporte o projeto em PDF.":"Inicie o processamento quando as imagens estiverem prontas."}</span>
                </Link>
              </div>
            </div>
          </> : <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-3xl text-emerald-800">⌖</span>
            <h2 className="mt-5 text-2xl font-semibold">{query.levantamento ? "Levantamento não encontrado" : "Seu trabalho, organizado por área"}</h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-slate-500">Escolha um levantamento ao lado ou crie uma nova área para começar.</p>
            <Link href="/painel?novo=1" className="mt-6 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white">Criar levantamento</Link>
          </div>}
        </section>
      </div>}

      <footer className="py-8 text-center text-xs text-slate-400">Orion Maps · Mapeamento de precisão</footer>
    </div>
  </main>;
}

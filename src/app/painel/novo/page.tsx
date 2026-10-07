import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccessToken, getCurrentUser } from "@/lib/supabase/auth";
import { SurveyForm } from "../workspace";

export default async function NewSurveyPage() {
  const [user, token] = await Promise.all([getCurrentUser(), getCurrentAccessToken()]);
  if (!user || !token) redirect("/entrar");

  return <main className="min-h-screen bg-[#eaf1e7] px-3 pb-24 pt-5 text-slate-900 sm:px-7 sm:pt-8">
    <div className="mx-auto max-w-3xl">
      <header className="mb-5 flex items-center justify-between gap-4">
        <Link href="/painel" aria-label="Voltar aos levantamentos" className="rounded-2xl bg-[#071a1c] px-4 py-2">
          <Image src="/orion-maps-logo.jpg" width={420} height={180} alt="Orion Maps Drones" className="h-14 w-40 object-contain" />
        </Link>
        <Link href="/painel" className="rounded-xl border border-emerald-800/20 bg-white px-4 py-3 text-sm font-semibold text-emerald-900">Cancelar</Link>
      </header>
      <section aria-labelledby="new-survey-heading" className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_12px_34px_rgba(35,72,48,.10)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Orion Maps · Campo</p>
        <h1 id="new-survey-heading" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Novo levantamento</h1>
        <p className="mb-6 mt-2 text-sm leading-6 text-slate-600">Dê um nome à área. Depois de criar, adicione as fotos do voo.</p>
        <SurveyForm />
      </section>
    </div>
  </main>;
}

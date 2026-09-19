import { redirect } from "next/navigation";

import { getCurrentAccessToken, getCurrentUser } from "@/lib/supabase/auth";
import { getProfile } from "@/lib/supabase/profile";

import { signOutAction } from "./actions";

const cards = [
  ["Clientes", "0", "Cadastre quem solicita cada levantamento."],
  ["Projetos", "0", "Acompanhe os trabalhos em um só lugar."],
  ["Processamentos", "0", "O processamento fotogramétrico entra na próxima fase."],
];

export default async function PainelPage() {
  const [user, accessToken] = await Promise.all([getCurrentUser(), getCurrentAccessToken()]);
  if (!user || !accessToken) redirect("/entrar");

  const profile = await getProfile(user.id, accessToken);
  const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  const firstName = (profile?.full_name ?? metadataName ?? "Piloto").split(" ")[0];

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-8 sm:px-10 lg:px-12">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-emerald-950/10 pb-7">
        <span className="text-xl font-bold tracking-tight">ORION <span className="font-normal">MAPS</span></span>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>
          <form action={signOutAction}>
            <button className="rounded-xl border border-emerald-950/15 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">Sair</button>
          </form>
        </div>
      </header>

      <section className="py-12 sm:py-16">
        <p className="text-sm font-semibold text-emerald-700">Painel</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-emerald-950">Olá, {firstName}.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">A estrutura segura da sua conta está pronta. Agora vamos construir o fluxo de clientes e projetos.</p>
      </section>

      <section aria-labelledby="resumo">
        <div className="flex items-center justify-between gap-4">
          <h2 id="resumo" className="text-lg font-semibold text-emerald-950">Resumo do trabalho</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">Dados de demonstração</span>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {cards.map(([title, value, description]) => (
            <article key={title} className="rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-emerald-700">{title}</p>
              <p className="mt-5 text-4xl font-semibold text-emerald-950">{value}</p>
              <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

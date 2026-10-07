import Link from "next/link";

export default function LoadingNewSurvey() {
  return <main className="min-h-screen bg-[#eaf1e7] px-3 pb-24 pt-5 text-slate-900 sm:px-7 sm:pt-8">
    <div className="mx-auto max-w-3xl">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div aria-hidden="true" className="h-[72px] w-48 animate-pulse rounded-2xl bg-[#071a1c]" />
        <Link href="/painel" className="rounded-xl border border-emerald-800/20 bg-white px-4 py-3 text-sm font-semibold text-emerald-900">Cancelar</Link>
      </header>
      <section role="status" aria-live="polite" aria-busy="true" className="rounded-[28px] border border-white/80 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold">Novo levantamento</h1>
        <p className="mt-2 text-sm text-slate-600">Abrindo formulário…</p>
        <div aria-hidden="true" className="mt-7 animate-pulse space-y-5">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="h-12 rounded-xl bg-slate-100" />
          <div className="grid gap-5 sm:grid-cols-2"><div className="h-20 rounded-xl bg-slate-100" /><div className="h-20 rounded-xl bg-slate-100" /></div>
          <div className="h-20 rounded-xl bg-slate-100" />
          <div className="h-32 rounded-xl bg-slate-100" />
        </div>
      </section>
    </div>
  </main>;
}

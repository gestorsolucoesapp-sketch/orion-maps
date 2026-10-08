import Link from "next/link";

import { AuthForm } from "./auth-form";

export default function EntrarPage() {
  return (
    <main className="orion-signin grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex flex-col justify-between bg-emerald-950 px-7 py-8 text-white sm:px-12 lg:px-16">
        <Link href="/" className="orion-workspace-brand"><span className="orion-symbol" aria-hidden="true">O</span><span>ORION <b>MAPS</b><small>LEVANTAMENTO AÉREO</small></span></Link>
        <div className="max-w-xl py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Plataforma de levantamentos</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Seu trabalho de campo, organizado.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-emerald-50/70">Planeje voos, reúna fotografias e acompanhe os produtos do levantamento.</p>
        </div>
        <p className="text-sm text-emerald-100/50">Orion Maps · levantamento aéreo</p>
      </section>
      <section className="flex items-center justify-center px-6 py-14 sm:px-12">
        <div className="w-full max-w-md">
          <p className="mb-3 text-sm font-semibold text-emerald-700">Acesso seguro</p>
          <h2 className="mb-8 text-3xl font-semibold tracking-tight text-emerald-950">Bem-vindo ao Orion Maps</h2>
          <AuthForm />
        </div>
      </section>
    </main>
  );
}

"use client";

import { useActionState, useState } from "react";

import { signInAction, signUpAction, type AuthState } from "./actions";

const initialState: AuthState = {};

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(signInAction, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signUpAction, initialState);
  const state = mode === "login" ? loginState : signupState;
  const pending = mode === "login" ? loginPending : signupPending;

  return (
    <div className="rounded-3xl border border-emerald-950/10 bg-white p-7 shadow-[0_24px_70px_rgba(18,67,52,0.12)] sm:p-9">
      <div className="mb-8 grid grid-cols-2 rounded-xl bg-emerald-950/5 p-1" aria-label="Escolha entrar ou cadastrar">
        <button type="button" onClick={() => setMode("login")} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === "login" ? "bg-white text-emerald-950 shadow-sm" : "text-slate-500"}`}>
          Entrar
        </button>
        <button type="button" onClick={() => setMode("signup")} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === "signup" ? "bg-white text-emerald-950 shadow-sm" : "text-slate-500"}`}>
          Criar conta
        </button>
      </div>

      <form action={mode === "login" ? loginAction : signupAction} className="space-y-5">
        {mode === "signup" ? (
          <label className="block text-sm font-medium text-emerald-950">
            Nome
            <input name="fullName" autoComplete="name" required minLength={2} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" placeholder="Seu nome" />
          </label>
        ) : null}
        <label className="block text-sm font-medium text-emerald-950">
          E-mail
          <input name="email" type="email" autoComplete="email" required className="mt-2 w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" placeholder="voce@empresa.com" />
        </label>
        <label className="block text-sm font-medium text-emerald-950">
          Senha
          <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" placeholder="Mínimo de 8 caracteres" />
        </label>

        {state.error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}
        {state.message ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{state.message}</p> : null}

        <button disabled={pending} className="w-full rounded-xl bg-emerald-800 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60">
          {pending ? "Aguarde..." : mode === "login" ? "Entrar no Orion Maps" : "Criar minha conta"}
        </button>
      </form>
    </div>
  );
}

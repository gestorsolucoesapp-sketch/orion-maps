"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { setSessionCookies, signIn, signUp } from "@/lib/supabase/auth";

export type AuthState = { error?: string; message?: string };

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");
  if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
  return { email, password };
}

function friendlyError(error: unknown) {
  if (!(error instanceof Error)) return "Não foi possível concluir. Tente novamente.";
  const value = error.message.toLowerCase();
  if (value.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (value.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (value.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (value.includes("rate limit")) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  if (value.includes("fetch failed") || value.includes("failed to fetch")) {
    return "Não foi possível falar com o serviço de acesso. Verifique sua conexão e tente novamente.";
  }
  return error.message;
}

export async function signInAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  let session;
  try {
    const { email, password } = readCredentials(formData);
    session = await signIn(email, password);
    await setSessionCookies(session);
  } catch (error) {
    return { error: friendlyError(error) };
  }
  redirect("/painel");
}

export async function signUpAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  let authenticated = false;
  try {
    const { email, password } = readCredentials(formData);
    const fullName = String(formData.get("fullName") ?? "").trim();
    if (fullName.length < 2) return { error: "Informe seu nome." };

    const headerStore = await headers();
    const origin = headerStore.get("origin") ?? "http://localhost:3000";
    const result = await signUp(email, password, fullName, `${origin}/entrar?confirmado=1`);

    if (result.access_token && result.refresh_token && result.expires_in && result.user) {
      await setSessionCookies(result as Parameters<typeof setSessionCookies>[0]);
      authenticated = true;
    } else {
      return { message: "Cadastro recebido. Abra o e-mail de confirmação e depois entre na plataforma." };
    }
  } catch (error) {
    return { error: friendlyError(error) };
  }
  if (authenticated) redirect("/painel");
  return { error: "Não foi possível iniciar sua sessão." };
}

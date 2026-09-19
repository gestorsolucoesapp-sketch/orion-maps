import { cookies } from "next/headers";

import { getSupabaseConfig } from "./config";

const ACCESS_COOKIE = "orion-access-token";
const REFRESH_COOKIE = "orion-refresh-token";

type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SupabaseUser;
};

type AuthResponse = Partial<AuthSession> & {
  msg?: string;
  error?: string;
  error_description?: string;
};

async function authRequest(path: string, init: RequestInit, accessToken?: string) {
  const { url, publishableKey } = getSupabaseConfig();
  return fetch(`${url}/auth/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
}

async function readAuthResponse(response: Response): Promise<AuthResponse> {
  const body = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) {
    const message = body.msg ?? body.error_description ?? body.error ?? "Não foi possível concluir a autenticação.";
    throw new Error(message);
  }
  return body;
}

export async function signIn(email: string, password: string) {
  const response = await authRequest("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return (await readAuthResponse(response)) as AuthSession;
}

export async function signUp(email: string, password: string, fullName: string, redirectTo: string) {
  const response = await authRequest(`/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email, password, data: { full_name: fullName } }),
  });
  return readAuthResponse(response);
}

export async function refreshSession(refreshToken: string) {
  const response = await authRequest("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return null;
  return (await response.json()) as AuthSession;
}

export async function getUser(accessToken: string) {
  const response = await authRequest("/user", { method: "GET" }, accessToken);
  if (!response.ok) return null;
  return (await response.json()) as SupabaseUser;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;
  return getUser(accessToken);
}

export async function getCurrentAccessToken() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export async function setSessionCookies(session: AuthSession) {
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  cookieStore.set(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: session.expires_in,
  });
  cookieStore.set(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}

export async function signOut() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    await authRequest("/logout", { method: "POST" }, accessToken).catch(() => undefined);
  }
  await clearSessionCookies();
}

export const authCookieNames = { access: ACCESS_COOKIE, refresh: REFRESH_COOKIE };

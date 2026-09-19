import { NextResponse, type NextRequest } from "next/server";

import { authCookieNames, getUser, refreshSession } from "./auth";

function setSessionCookies(response: NextResponse, session: Awaited<ReturnType<typeof refreshSession>>) {
  if (!session) return;
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(authCookieNames.access, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: session.expires_in,
  });
  response.cookies.set(authCookieNames.refresh, session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function updateSession(request: NextRequest) {
  const accessToken = request.cookies.get(authCookieNames.access)?.value;
  const refreshToken = request.cookies.get(authCookieNames.refresh)?.value;
  let authenticated = accessToken ? Boolean(await getUser(accessToken)) : false;
  let refreshedSession = null;

  if (!authenticated && refreshToken) {
    refreshedSession = await refreshSession(refreshToken);
    authenticated = Boolean(refreshedSession);
  }

  if (!authenticated) {
    const loginUrl = new URL("/entrar", request.url);
    loginUrl.searchParams.set("retorno", request.nextUrl.pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(authCookieNames.access);
    response.cookies.delete(authCookieNames.refresh);
    return response;
  }

  const response = NextResponse.next({ request });
  setSessionCookies(response, refreshedSession);
  return response;
}

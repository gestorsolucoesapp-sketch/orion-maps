import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/painel/:path*", "/processamento/:path*", "/agro/:path*", "/api/processing-link/:path*", "/api/processing-preview/:path*"],
};

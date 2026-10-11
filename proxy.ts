import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { buildCsp } from "./lib/security/headers";

/**
 * 1. A fresh nonce and strict Content-Security-Policy for every page (§22): Next.js reads the nonce
 *    from the request header and puts it on its own scripts, so injected scripts can't run.
 * 2. Refreshes the Supabase session cookie on navigation (required by @supabase/ssr).
 * Not an authorization layer: every page and server action checks the member itself (§6).
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({
    isDev: process.env.NODE_ENV !== "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    nonce,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const next = () => {
    const r = NextResponse.next({ request: { headers: requestHeaders } });
    r.headers.set("Content-Security-Policy", csp);
    return r;
  };

  let response = next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        // Keep the refreshed cookies in the forwarded request headers too.
        requestHeaders.set("cookie", request.cookies.toString());
        response = next();
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Validates the token with Supabase Auth and refreshes it if needed.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // Skip static assets, images, the auth hook, cron and webhook routes.
    "/((?!_next/static|_next/image|icon.png|brand/|api/auth/hooks/|api/cron/|api/webhooks/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};

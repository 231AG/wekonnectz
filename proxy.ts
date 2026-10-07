import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on navigation (required by @supabase/ssr).
 * Not an authorization layer: every page and server action checks the member itself (§6).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
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
    // Skip static assets, images, the auth hook route and the dev UI kit.
    "/((?!_next/static|_next/image|icon.png|brand/|api/auth/hooks/|api/cron/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};

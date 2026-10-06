import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Ends the session and clears auth cookies. Used when a banned or deleted account still holds a
 * session (BR-6, BR-7). Signing out is harmless, so GET is acceptable here.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const notice = request.nextUrl.searchParams.get("notice") === "unavailable" ? "?notice=unavailable" : "";
  return NextResponse.redirect(new URL(`/login${notice}`, request.url));
}

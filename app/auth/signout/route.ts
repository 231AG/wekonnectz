import { NextResponse, type NextRequest } from "next/server";

import { canHoldSession, getMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Ends the session of an account that may no longer hold one (BANNED / DELETED, BR-6, BR-7).
 * Server Components can't clear cookies, so `requireMember()` redirects here.
 * A normal member is NOT signed out by visiting this URL (no cross-site logout); everyday
 * logout is the POST server action `signOut`.
 */
export async function GET(request: NextRequest) {
  const member = await getMember();
  if (member && canHoldSession(member.status)) return NextResponse.redirect(new URL("/", request.url));
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?notice=unavailable", request.url));
}

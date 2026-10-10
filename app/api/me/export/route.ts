import { NextResponse } from "next/server";

import { canHoldSession, getMember } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Download my data (spec §22 privacy: data export on request). The member's own account only, from
 * the session; no storage paths, no other member's private data, no moderation notes. Limited per
 * day by export.max_per_day (T-19; no limit while unset). Nothing from the export is logged.
 */
export async function GET() {
  const member = await getMember();
  if (!member || !canHoldSession(member.status) || member.role !== "USER") {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: limit } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "export.max_per_day")
    .maybeSingle();
  const max = typeof limit?.value === "number" ? limit.value : null;
  if (max !== null) {
    const { data: allowed, error } = await admin.rpc("rate_limit_hit", {
      p_bucket: "export.day",
      p_subject: member.id,
      p_window_seconds: 86_400,
      p_max: max,
    });
    if (error) return NextResponse.json({ error: "Try again later." }, { status: 503 });
    if (!allowed)
      return NextResponse.json(
        { error: "You’ve downloaded your data enough times today. Try again tomorrow." },
        { status: 429 },
      );
  }
  const { data, error } = await admin.rpc("member_data_export", { p_user: member.id });
  if (error || !data) return NextResponse.json({ error: "Try again later." }, { status: 500 });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="wekonnectz-my-data-${day}.json"`,
      "Cache-Control": "no-store, private",
    },
  });
}

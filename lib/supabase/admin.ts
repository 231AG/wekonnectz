import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client (spec §6 rule 3: server-only). Bypasses RLS — use only for the narrow
 * server functions granted to service_role (begin_signup, rate_limit_hit, …), never for member reads.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

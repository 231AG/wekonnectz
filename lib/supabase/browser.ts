"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env.public";
import type { Database } from "@/lib/supabase/database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Browser client for Realtime only (anon key + the member's session). Members never read tables
 * from the browser: every table is closed to clients; private channels are authorised in the
 * database by conversation membership.
 */
export function browserClient() {
  if (!client) {
    const env = publicEnv();
    client = createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}

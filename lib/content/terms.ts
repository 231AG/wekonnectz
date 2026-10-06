import "server-only";

import { z } from "zod";

import type { DetectionTerms } from "@/lib/domain/detection";
import { createAdminClient } from "@/lib/supabase/admin";

const termsSchema = z.object({
  contact: z.array(z.string()),
  price: z.array(z.string()),
  money_request: z.array(z.string()),
});

let cache: { at: number; terms: DetectionTerms } | undefined;
const TTL_MS = 60_000;

/**
 * Detection terms from app_settings (moderators can update them, §17). Cached for a minute.
 * Fails loudly if the setting is missing or malformed (§6 rule 9): content is never accepted unchecked.
 */
export async function getDetectionTerms(): Promise<DetectionTerms> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.terms;
  const { data, error } = await createAdminClient().rpc("get_setting", { p_key: "detection.terms" });
  if (error) throw new Error("detection.terms setting is unavailable");
  const terms = termsSchema.parse(data);
  cache = { at: Date.now(), terms };
  return terms;
}

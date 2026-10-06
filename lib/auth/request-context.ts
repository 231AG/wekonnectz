import "server-only";

import { headers } from "next/headers";

import { requestCountry } from "@/lib/domain/geo";
import { serverEnv } from "@/lib/env.server";

/** Country of the current request for the signup pre-filter (BR-1). Read only in server actions (§3 rule 4). */
export async function currentRequestCountry(): Promise<string | null> {
  const h = await headers();
  const env = serverEnv();
  return requestCountry({
    vercelCountry: h.get("x-vercel-ip-country"),
    onVercel: env.VERCEL === "1",
    trustHeaderOffVercel: env.GEO_TRUST_HEADER === "1" && env.VERCEL !== "1",
    // Dev fallback only in `next dev`; a production build (Vercel or anywhere else) fails closed.
    devCountry: process.env.NODE_ENV === "production" ? null : (env.DEV_GEO_COUNTRY ?? null),
  });
}

/** Client IP, used only as a rate-limit key. Hashed in the database, never stored raw (OD-12). */
export async function currentRequestIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

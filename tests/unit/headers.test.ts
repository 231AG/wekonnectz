import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "@/lib/security/headers";

const asMap = (headers: { key: string; value: string }[]) => new Map(headers.map((h) => [h.key, h.value]));

// Spec §22 Headers: CSP, HSTS, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin.
describe("security headers (§22)", () => {
  const prod = asMap(buildSecurityHeaders({ isDev: false, supabaseUrl: "https://abc.supabase.co" }));

  it("sets the four headers the spec requires", () => {
    expect(prod.get("X-Frame-Options")).toBe("DENY");
    expect(prod.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(prod.get("Strict-Transport-Security")).toMatch(/max-age=\d{8,}/);
    expect(prod.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("never allows eval in production", () => {
    expect(prod.get("Content-Security-Policy")).not.toContain("unsafe-eval");
  });

  it("allows Supabase over https and wss only for the configured project", () => {
    const csp = prod.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("https://abc.supabase.co");
    expect(csp).toContain("wss://abc.supabase.co");
  });

  it("blocks geolocation (BR-20) and allows the camera for selfies only on our origin", () => {
    expect(prod.get("Permissions-Policy")).toContain("geolocation=()");
    expect(prod.get("Permissions-Policy")).toContain("camera=(self)");
  });
});

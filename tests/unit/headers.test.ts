import { describe, expect, it } from "vitest";

import { API_CSP, buildCsp, buildSecurityHeaders } from "@/lib/security/headers";

const asMap = (headers: { key: string; value: string }[]) => new Map(headers.map((h) => [h.key, h.value]));

// Spec §22 Headers: CSP, HSTS, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin.
describe("security headers (§22)", () => {
  const all = asMap(buildSecurityHeaders());
  const csp = buildCsp({ isDev: false, supabaseUrl: "https://abc.supabase.co", nonce: "bm9uY2U=" });

  it("sets the headers the spec requires", () => {
    expect(all.get("X-Frame-Options")).toBe("DENY");
    expect(all.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(all.get("Strict-Transport-Security")).toMatch(/max-age=\d{8,}/);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("does not request HSTS preload before the domain is settled", () => {
    expect(all.get("Strict-Transport-Security")).not.toContain("preload");
  });

  it("Phase 12: scripts only with this request's nonce — no unsafe-inline or eval for scripts in production", () => {
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toBe("script-src 'self' 'nonce-bm9uY2U=' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(buildCsp({ isDev: true, nonce: "x" })).toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("allows Supabase over https and wss only for the configured project", () => {
    expect(csp).toContain("https://abc.supabase.co");
    expect(csp).toContain("wss://abc.supabase.co");
  });

  it("API responses run nothing and can't be framed", () => {
    expect(API_CSP).toContain("default-src 'none'");
    expect(API_CSP).toContain("frame-ancestors 'none'");
  });

  it("blocks geolocation (BR-20) and allows the camera for selfies only on our origin", () => {
    expect(all.get("Permissions-Policy")).toContain("geolocation=()");
    expect(all.get("Permissions-Policy")).toContain("camera=(self)");
  });
});

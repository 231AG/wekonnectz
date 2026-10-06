/**
 * Request-country decision for the signup pre-filter (BR-1, spec §3). Pure.
 *
 * The +231 OTP is the real Liberia control; this is a pre-filter that VPNs defeat (plan §1.5).
 * On Vercel the edge sets `x-vercel-ip-country` and replaces any value the client sent [VERIFY T-02].
 * Anywhere else the header could be spoofed, so it is trusted only when explicitly allowed
 * (local tests). Unknown country = blocked (fail closed).
 */

export const ALLOWED_COUNTRY = "LR";

export type GeoInputs = {
  /** Value of x-vercel-ip-country (or null). */
  vercelCountry: string | null;
  /** True when running on Vercel (process.env.VERCEL === "1"). */
  onVercel: boolean;
  /** Test-only: trust the header even off Vercel (GEO_TRUST_HEADER=1). Never set in production. */
  trustHeaderOffVercel: boolean;
  /** Dev-only fallback when no trusted header is present (DEV_GEO_COUNTRY). Ignored on Vercel. */
  devCountry: string | null;
};

const ISO2 = /^[A-Z]{2}$/;

export function requestCountry(input: GeoInputs): string | null {
  const header = input.vercelCountry?.trim().toUpperCase() ?? "";
  if ((input.onVercel || input.trustHeaderOffVercel) && ISO2.test(header)) return header;
  if (input.onVercel) return null;
  const dev = input.devCountry?.trim().toUpperCase() ?? "";
  return ISO2.test(dev) ? dev : null;
}

export function isAllowedCountry(country: string | null): boolean {
  return country === ALLOWED_COUNTRY;
}

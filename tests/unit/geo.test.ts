import { describe, expect, it } from "vitest";

import { isAllowedCountry, requestCountry } from "@/lib/domain/geo";

const base = { vercelCountry: null, onVercel: false, trustHeaderOffVercel: false, devCountry: null };

describe("BR-1 request country", () => {
  it("BR-1: trusts the Vercel header on Vercel", () => {
    expect(requestCountry({ ...base, onVercel: true, vercelCountry: "LR" })).toBe("LR");
    expect(requestCountry({ ...base, onVercel: true, vercelCountry: "gb" })).toBe("GB");
  });

  it("BR-1: fails closed on Vercel when the header is missing, even with a dev fallback set", () => {
    expect(requestCountry({ ...base, onVercel: true, devCountry: "LR" })).toBeNull();
  });

  it("BR-1: ignores a spoofable header off Vercel unless tests opt in", () => {
    expect(requestCountry({ ...base, vercelCountry: "LR" })).toBeNull();
    expect(requestCountry({ ...base, vercelCountry: "LR", trustHeaderOffVercel: true })).toBe("LR");
  });

  it("uses the dev fallback only off Vercel", () => {
    expect(requestCountry({ ...base, devCountry: "lr" })).toBe("LR");
  });

  it("rejects malformed values", () => {
    expect(requestCountry({ ...base, onVercel: true, vercelCountry: "LIB" })).toBeNull();
  });

  it("BR-1: only LR is allowed", () => {
    expect(isAllowedCountry("LR")).toBe(true);
    expect(isAllowedCountry("GB")).toBe(false);
    expect(isAllowedCountry(null)).toBe(false);
  });
});

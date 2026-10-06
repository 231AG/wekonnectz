import { describe, expect, it } from "vitest";

import { ageOn, checkAdult, parseDateParts, toIsoDate } from "@/lib/domain/age";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("BR-4 age gate", () => {
  it("BR-4: accepts someone who turns 18 today", () => {
    expect(checkAdult("6", "10", "2008", at("2026-10-06"))).toEqual({
      ok: true,
      dob: { year: 2008, month: 10, day: 6 },
    });
  });

  it("BR-4: refuses someone who turns 18 tomorrow", () => {
    expect(checkAdult("7", "10", "2008", at("2026-10-06"))).toEqual({ ok: false, reason: "UNDER_18" });
  });

  it("BR-4: refuses a future date of birth", () => {
    expect(checkAdult("1", "1", "2030", at("2026-10-06"))).toEqual({ ok: false, reason: "UNDER_18" });
  });

  it("BR-4: leap-day birthday turns 18 on 1 March in a non-leap year", () => {
    expect(checkAdult("29", "2", "2008", at("2026-02-28")).ok).toBe(false);
    expect(checkAdult("29", "2", "2008", at("2026-03-01")).ok).toBe(true);
  });

  it("rejects dates that don't exist", () => {
    expect(parseDateParts("31", "4", "1999")).toBeNull();
    expect(parseDateParts("29", "2", "2001")).toBeNull();
    expect(parseDateParts("0", "1", "1999")).toBeNull();
    expect(parseDateParts("12", "13", "1999")).toBeNull();
    expect(parseDateParts("1", "1", "99")).toBeNull();
    expect(parseDateParts("a", "1", "1999")).toBeNull();
    expect(checkAdult("31", "4", "1999").ok).toBe(false);
  });

  it("refuses implausible ages (typos)", () => {
    expect(checkAdult("1", "1", "1800", at("2026-10-06"))).toEqual({ ok: false, reason: "IMPLAUSIBLE" });
  });

  it("computes whole years", () => {
    expect(ageOn({ year: 1999, month: 3, day: 14 }, { year: 2026, month: 3, day: 13 })).toBe(26);
    expect(ageOn({ year: 1999, month: 3, day: 14 }, { year: 2026, month: 3, day: 14 })).toBe(27);
  });

  it("formats ISO dates", () => {
    expect(toIsoDate({ year: 1999, month: 3, day: 4 })).toBe("1999-03-04");
  });
});

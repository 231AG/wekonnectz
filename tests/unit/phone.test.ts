import { describe, expect, it } from "vitest";

import { checkLiberianPhone, maskPhone } from "@/lib/domain/phone";

describe("BR-2 Liberian phone numbers", () => {
  it.each([
    "0770123456",
    "770123456",
    "+231770123456",
    "+231 77 012 3456",
    "00231770123456",
    "0880123456",
    "0555123456",
  ])("BR-2: accepts %s", (input) => {
    const result = checkLiberianPhone(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toMatch(/^\+231\d{8,9}$/);
  });

  it.each(["+447700900123", "+12025550123", "0044 7700 900123", "+233241234567"])(
    "BR-2: refuses foreign %s",
    (input) => {
      expect(checkLiberianPhone(input)).toEqual({ ok: false, reason: "NOT_LIBERIAN" });
    },
  );

  it.each(["", "abc", "+2317701234", "07701"])("refuses invalid %s", (input) => {
    expect(checkLiberianPhone(input)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("normalises local and international forms to the same number", () => {
    expect(checkLiberianPhone("0770123456")).toEqual(checkLiberianPhone("+231 770 123 456"));
  });

  it("masks for display like the mock-up", () => {
    expect(maskPhone("+231770123452")).toBe("+231 77 • • • • 452");
  });
});

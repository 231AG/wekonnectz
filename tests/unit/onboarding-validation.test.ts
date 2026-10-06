import { describe, expect, it } from "vitest";

import { basicsSchema, fieldErrors, interestsBioSchema } from "@/lib/validation/onboarding";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("basics form (§10 steps 5–6)", () => {
  const valid = { displayName: "Musu", gender: "WOMAN", seeking: ["MAN"], areaId: uuid(1), intent: "BOTH" };

  it("accepts a valid form and trims the name", () => {
    expect(basicsSchema.parse({ ...valid, displayName: "  Musu  " }).displayName).toBe("Musu");
  });

  it.each(["M", "x".repeat(31), "Musu2", "@musu", "Musu 0770"])("rejects display name %j", (displayName) => {
    expect(basicsSchema.safeParse({ ...valid, displayName }).success).toBe(false);
  });

  it.each(["Mary-Ann", "D'Angelo", "Kɔlubah", "Sia Musu"])("accepts display name %j", (displayName) => {
    expect(basicsSchema.safeParse({ ...valid, displayName }).success).toBe(true);
  });

  it("requires at least one 'interested in' and an intent", () => {
    const r = basicsSchema.safeParse({ ...valid, seeking: [], intent: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["intent", "seeking"]);
  });
});

describe("interests and bio (§10 steps 7–8)", () => {
  it("needs at least 3 distinct interests", () => {
    expect(interestsBioSchema.safeParse({ interestIds: [uuid(1), uuid(2)], bio: "" }).success).toBe(false);
    expect(interestsBioSchema.safeParse({ interestIds: [uuid(1), uuid(1), uuid(2)], bio: "" }).success).toBe(false);
    expect(interestsBioSchema.safeParse({ interestIds: [uuid(1), uuid(2), uuid(3)], bio: "" }).success).toBe(true);
  });

  it("caps the bio at 500 characters", () => {
    const ids = [uuid(1), uuid(2), uuid(3)];
    expect(interestsBioSchema.safeParse({ interestIds: ids, bio: "a".repeat(500) }).success).toBe(true);
    expect(interestsBioSchema.safeParse({ interestIds: ids, bio: "a".repeat(501) }).success).toBe(false);
  });
});

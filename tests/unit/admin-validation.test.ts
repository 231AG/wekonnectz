import { describe, expect, it } from "vitest";

import { isRunningNow } from "@/lib/domain/time";
import {
  correctDobSchema,
  createStaffSchema,
  extendSubscriptionSchema,
  merchantAccountSchema,
  parseSettingValue,
  planSchema,
  refundSchema,
} from "@/lib/validation/admin";

const id = "3f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f";

describe("settings values (§21; validated again in the database)", () => {
  it("whole numbers only for number settings", () => {
    expect(parseSettingValue("int", " 45 ")).toEqual({ value: 45 });
    expect(parseSettingValue("int", "4.5")).toHaveProperty("error");
    expect(parseSettingValue("int", "-1")).toHaveProperty("error");
    expect(parseSettingValue("int", "")).toHaveProperty("error");
    expect(parseSettingValue("int", "12345678")).toHaveProperty("error");
  });
  it("yes/no settings take true or false", () => {
    expect(parseSettingValue("bool", "true")).toEqual({ value: true });
    expect(parseSettingValue("bool", "false")).toEqual({ value: false });
    expect(parseSettingValue("bool", "1")).toHaveProperty("error");
  });
  it("lists and objects must be the right JSON shape", () => {
    expect(parseSettingValue("array", '["a"]')).toEqual({ value: ["a"] });
    expect(parseSettingValue("array", "[]")).toHaveProperty("error");
    expect(parseSettingValue("array", '{"a":1}')).toHaveProperty("error");
    expect(parseSettingValue("object", '{"a":1}')).toEqual({ value: { a: 1 } });
    expect(parseSettingValue("object", "[1]")).toHaveProperty("error");
    expect(parseSettingValue("object", "{oops")).toHaveProperty("error");
  });
  it("a choice needs a value (the database checks it is allowed)", () => {
    expect(parseSettingValue("enum", "EVERY_SESSION")).toEqual({ value: "EVERY_SESSION" });
    expect(parseSettingValue("enum", " ")).toHaveProperty("error");
  });
});

describe("staff forms", () => {
  it("BR-34: a DOB correction, an extension and a refund all need a reason", () => {
    expect(correctDobSchema.safeParse({ userId: id, dob: "1996-05-20", reason: "ok" }).success).toBe(false);
    expect(correctDobSchema.safeParse({ userId: id, dob: "1996-05-20", reason: "ID card checked" }).success).toBe(true);
    expect(extendSubscriptionSchema.safeParse({ subscriptionId: id, days: "2", reason: "" }).success).toBe(false);
    expect(extendSubscriptionSchema.safeParse({ subscriptionId: id, days: "0", reason: "Outage" }).success).toBe(false);
    expect(extendSubscriptionSchema.safeParse({ subscriptionId: id, days: "2", reason: "Outage" }).success).toBe(true);
    expect(refundSchema.safeParse({ paymentId: id, reason: "Paid twice", confirm: false }).success).toBe(false);
    expect(refundSchema.safeParse({ paymentId: id, reason: "Paid twice", confirm: true }).success).toBe(true);
  });
  it("plans need a positive price and duration", () => {
    const base = {
      name: "Day Pass",
      source: "MOBILE_MONEY",
      durationHours: "24",
      price: "1.5",
      active: true,
      sortOrder: "1",
    };
    expect(planSchema.safeParse(base).success).toBe(true);
    expect(planSchema.safeParse({ ...base, price: "0" }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, durationHours: "0" }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, code: "day pass" }).success).toBe(false);
  });
  it("wallets are Orange Money or MTN MoMo only", () => {
    const base = { provider: "ORANGE_MONEY", displayName: "WeKonnectz Ltd", numberOrCode: "0770000999", active: true };
    expect(merchantAccountSchema.safeParse(base).success).toBe(true);
    expect(merchantAccountSchema.safeParse({ ...base, provider: "CARD" }).success).toBe(false);
  });
  it("§7: staff roles only — never USER", () => {
    expect(createStaffSchema.safeParse({ email: "a@example.test", role: "MODERATOR" }).success).toBe(true);
    expect(createStaffSchema.safeParse({ email: "a@example.test", role: "USER" }).success).toBe(false);
  });
});

describe("isRunningNow", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("is true only between start and end", () => {
    expect(isRunningNow("2026-10-10T11:00:00Z", "2026-10-10T13:00:00Z", now)).toBe(true);
    expect(isRunningNow("2026-10-10T12:30:00Z", "2026-10-10T13:00:00Z", now)).toBe(false);
    expect(isRunningNow("2026-10-10T10:00:00Z", "2026-10-10T12:00:00Z", now)).toBe(false);
  });
});

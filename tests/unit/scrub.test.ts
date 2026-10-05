import { describe, expect, it } from "vitest";

import { FILTERED, scrub, scrubBreadcrumb, scrubEvent, scrubString } from "@/lib/observability/scrub";

// Spec §6 rule 7: never log phone numbers, dates of birth, storage paths or message text.
describe("scrubString — rule 7", () => {
  it.each([
    ["call +231 77 012 3456 now", "call [Filtered] now"],
    ["0770123456", FILTERED],
    ["number 077-012-3456", "number [Filtered]"],
    ["+2318861234567", FILTERED],
  ])("masks phone numbers: %s", (input, expected) => {
    expect(scrubString(input)).toBe(expected);
  });

  it.each([
    ["born 14/03/1999", "born [Filtered]"],
    ["dob=1999-03-14", "dob=[Filtered]"],
    ["14-3-99", FILTERED],
  ])("masks dates of birth: %s", (input, expected) => {
    expect(scrubString(input)).toBe(expected);
  });

  it.each([
    ["failed photos/2b9f/abc.webp", "failed [Filtered]"],
    ["missing verification/u1/selfie.jpg?x=1", "missing [Filtered]?x=1"],
    ["https://x.supabase.co/storage/v1/object/sign/payment-evidence/a.png?token=t", "https://x.supabase.co[Filtered]"],
    ["photos-quarantine/u/1.jpg", FILTERED],
  ])("masks storage paths: %s", (input, expected) => {
    expect(scrubString(input)).toBe(expected);
  });

  it("leaves ordinary text alone", () => {
    expect(scrubString("Profile step 4 failed validation")).toBe("Profile step 4 failed validation");
  });
});

describe("scrub — sensitive keys", () => {
  it("drops message text, bios, phone and DOB fields whatever their content", () => {
    const out = scrub({
      body: "hi there",
      bio: "Teacher by day",
      phone: "x",
      date_of_birth: "x",
      nested: { storage_path: "a", Text: "secret words", ok: "fine" },
      list: [{ sender_phone: "1" }],
    });
    expect(out).toEqual({
      body: FILTERED,
      bio: FILTERED,
      phone: FILTERED,
      date_of_birth: FILTERED,
      nested: { storage_path: FILTERED, Text: FILTERED, ok: "fine" },
      list: [{ sender_phone: FILTERED }],
    });
  });

  it("keeps technical ids and timestamps intact", () => {
    const event = { event_id: "1234567890abcdef1234567890abcdef", timestamp: 1759676400.123 };
    expect(scrub(event)).toEqual(event);
  });
});

describe("scrubEvent", () => {
  it("removes request bodies, cookies and user details except id", () => {
    const out = scrubEvent({
      message: "OTP failed for +231770123456",
      request: { url: "/register", data: { phone: "+231770123456" }, cookies: { a: "b" } },
      user: { id: "u-1", ip_address: "1.2.3.4", username: "musu" },
    });
    expect(out.message).toBe("OTP failed for [Filtered]");
    expect(out.request).toEqual({ url: "/register" });
    expect(out.user).toEqual({ id: "u-1" });
  });

  it("does not mutate the original event", () => {
    const original = { request: { data: { a: 1 } } };
    scrubEvent(original);
    expect(original.request.data).toEqual({ a: 1 });
  });
});

describe("scrub — leak paths found in Phase 0 audit", () => {
  it("removes query strings, headers and env from requests", () => {
    const out = scrubEvent({
      request: {
        url: "https://app.example/verify?otp=123456&dob=1999-1-2",
        query_string: "otp=123456&dob=1999-1-2",
        headers: { "X-Forwarded-For": "41.57.1.2", Referer: "https://app.example/?token=abc" },
        env: { REMOTE_ADDR: "41.57.1.2" },
        method: "POST",
      },
    });
    expect(out.request).toEqual({ url: "https://app.example/verify", method: "POST" });
  });

  it("masks non-padded ISO dates and bracketed phone numbers", () => {
    expect(scrubString("dob 1999-3-4")).toBe("dob [Filtered]");
    expect(scrubString("call +231 (77) 012-345")).toBe("call [Filtered]");
  });

  it("keeps UUIDs intact", () => {
    const id = "a7161234-5678-4abc-9def-123456789012";
    expect(scrubString(`user ${id} failed`)).toBe(`user ${id} failed`);
  });

  it("keeps span descriptions and route paths (not PII by themselves)", () => {
    expect(scrub({ description: "GET /home", path: "/admin/users" })).toEqual({
      description: "GET /home",
      path: "/admin/users",
    });
  });
});

describe("scrubBreadcrumb", () => {
  it("drops non-navigation breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "console", data: { arguments: ["+231770123456"] } })).toBeNull();
  });

  it("strips query strings from navigation breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "navigation", data: { from: "/a?otp=1", to: "/b#x" } })).toEqual({
      category: "navigation",
      data: { from: "/a", to: "/b" },
    });
  });
});

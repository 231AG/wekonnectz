import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
let env: Record<string, string | undefined> = {};
vi.mock("@/lib/env.server", () => ({ serverEnv: () => env }));

const { describeNotification, formatNoticeTime } = await import("@/lib/domain/notifications");
const { pushConfigured, pushPayload } = await import("@/lib/notifications/push");
const { pushSubscriptionSchema } = await import("@/lib/validation/notifications");

const conv = "3f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f";

describe("notification texts (§16, §20)", () => {
  it("§6 rule 7: never names anyone or quotes a message, whatever the payload holds", () => {
    const payload = { conversation_id: conv, body: "Hi Musu, call me", display_name: "Joseph", sender_id: conv };
    for (const type of ["REQUEST_RECEIVED", "REQUEST_ACCEPTED", "MATCH_CREATED", "MESSAGE_RECEIVED"]) {
      const t = describeNotification(type, payload);
      expect(`${t.title} ${t.body} ${t.href}`).not.toMatch(/Musu|Joseph|call me/);
    }
  });
  it("links to the right screen, and only to our own paths", () => {
    expect(describeNotification("MESSAGE_RECEIVED", { conversation_id: conv }).href).toBe(`/messages/${conv}`);
    expect(describeNotification("REQUEST_ACCEPTED", { conversation_id: "../../evil" }).href).toBe("/messages");
    expect(describeNotification("REQUEST_RECEIVED").href).toBe("/messages/requests");
    expect(describeNotification("MATCH_CREATED").href).toBe("/relationship/matches");
    expect(describeNotification("PASS_EXPIRING").href).toBe("/casual/get-access");
    expect(describeNotification("CARD_RENEWAL_REMINDER").href).toBe("/me/payments");
    expect(describeNotification("SOMETHING_NEW").href).toBe("/home");
  });
  it("counts grouped messages", () => {
    expect(describeNotification("MESSAGE_RECEIVED", { conversation_id: conv, count: 3 }).title).toBe("3 new messages");
    expect(describeNotification("MESSAGE_RECEIVED", { conversation_id: conv }).title).toBe("New message");
  });
  it("reminders say when, in Liberia time", () => {
    expect(formatNoticeTime("2026-10-12T23:00:00Z")).toMatch(/12 Oct.*11:00\s?pm/i);
    expect(describeNotification("PASS_EXPIRING", { ends_at: "2026-10-12T23:00:00Z" }).body).toMatch(/Access ends/);
    expect(formatNoticeTime("not a date")).toBe("");
  });
});

describe("web push (OD-25)", () => {
  it("is off until all three VAPID values are set (T-20)", () => {
    env = {};
    expect(pushConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "B".repeat(87));
    env = { VAPID_PRIVATE_KEY: "x".repeat(43), VAPID_SUBJECT: "mailto:ops@example.test" };
    expect(pushConfigured()).toBe(true);
    vi.unstubAllEnvs();
    expect(pushConfigured()).toBe(false);
  });
  it("the push carries only the generic text and a local link", () => {
    const body = JSON.parse(pushPayload("MESSAGE_RECEIVED", { conversation_id: conv, body: "secret text" }));
    expect(body).toEqual({
      title: "New message",
      body: "Open the chat to read it.",
      url: `/messages/${conv}`,
      tag: `/messages/${conv}`,
    });
  });
  it("only https push endpoints with well-formed keys are stored", () => {
    const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
    expect(
      pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys }).success,
    ).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "http://push.example.test/x", keys }).success).toBe(false);
    // Only the browsers' push services: the server never calls an address a member chose.
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://attacker.example.test/hook", keys }).success).toBe(
      false,
    );
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://web.push.apple.com/abc", keys }).success).toBe(true);
    expect(
      pushSubscriptionSchema.safeParse({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc", keys })
        .success,
    ).toBe(true);
    expect(
      pushSubscriptionSchema.safeParse({ endpoint: "https://x.test/y", keys: { ...keys, auth: "no spaces!" } }).success,
    ).toBe(false);
  });
});

describe("service worker", () => {
  it("opens only our own pages (no //other.site)", async () => {
    const { readFile } = await import("node:fs/promises");
    const sw = await readFile("public/sw.js", "utf8");
    const check = new RegExp(sw.match(/\/\^\\\/\(\?!\\\/\)\//)![0].slice(1, -1));
    expect(check.test("/messages")).toBe(true);
    expect(check.test("//evil.example")).toBe(false);
    expect(check.test("https://evil.example")).toBe(false);
  });
});

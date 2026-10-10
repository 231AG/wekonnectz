import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

let env: Record<string, string | undefined> = {};
vi.mock("@/lib/env.server", () => ({ serverEnv: () => env }));

const { getCardProcessor, cardPaymentsEnabled } = await import("@/lib/payments/card/server");

const SECRET = "s".repeat(48);

describe("fake card processor stays local (OD-4, §6 rule 3)", () => {
  beforeEach(() => {
    env = {
      CARD_PROCESSOR: "fake",
      FAKE_CARD_WEBHOOK_SECRET: SECRET,
      ALLOW_FAKE_CARD_PROCESSOR: "1",
      CARD_PAYMENTS_ENABLED: "1",
    };
  });

  it("runs locally with the explicit opt-in", () => {
    expect(getCardProcessor()?.id).toBe("fake");
    expect(cardPaymentsEnabled()).toBe(true);
  });

  it("refuses without the opt-in", () => {
    env.ALLOW_FAKE_CARD_PROCESSOR = undefined;
    expect(() => getCardProcessor()).toThrow(/only locally/);
  });

  it("refuses on any Vercel deployment, preview included", () => {
    env.VERCEL = "1";
    expect(() => getCardProcessor()).toThrow(/only locally/);
  });

  it("no processor configured: card payments are off", () => {
    env = { CARD_PAYMENTS_ENABLED: "1" };
    expect(getCardProcessor()).toBeNull();
    expect(cardPaymentsEnabled()).toBe(false);
  });

  it("switched off: card UI hidden even with a processor", () => {
    env.CARD_PAYMENTS_ENABLED = "0";
    expect(cardPaymentsEnabled()).toBe(false);
  });
});

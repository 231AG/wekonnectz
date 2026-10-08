import { describe, expect, it } from "vitest";

import { formatDuration, formatLiberiaTime, formatUsd } from "@/lib/domain/money";
import { memberRejectionText } from "@/lib/payments/claims/labels";
import { claimSchema, replySchema } from "@/lib/validation/payments";

const id = "0d7b7c9e-6f4b-4a8e-9a55-2f1d1b7a1c11";
const valid = {
  planId: id,
  provider: "ORANGE_MONEY",
  transactionId: "OM123456",
  senderPhone: "0770 123 456",
  paidAt: "2026-10-01T14:30",
  evidenceId: id,
};

describe("plan display (OD-2: USD only)", () => {
  it("formats prices and lengths", () => {
    expect(formatUsd(5)).toBe("$5.00");
    expect(formatDuration(24)).toBe("24 hours");
    expect(formatDuration(168)).toBe("7 days");
    expect(formatDuration(720)).toBe("30 days");
  });

  it("shows times in GMT (Liberia)", () => {
    expect(formatLiberiaTime("2026-10-01T14:30:00Z")).toContain("14:30");
  });
});

describe("claim form (§16 step 4)", () => {
  it("accepts a complete claim; the amount is never an input", () => {
    expect(claimSchema.safeParse(valid).success).toBe(true);
    expect(Object.keys(claimSchema.shape)).not.toContain("amount");
  });

  it("requires a screenshot and a transaction ID", () => {
    expect(claimSchema.safeParse({ ...valid, evidenceId: "" }).success).toBe(false);
    expect(claimSchema.safeParse({ ...valid, transactionId: "ab" }).success).toBe(false);
  });

  it("refuses a payment time in the future", () => {
    expect(claimSchema.safeParse({ ...valid, paidAt: "2999-01-01T00:00" }).success).toBe(false);
  });

  it("a reply needs an answer or a new screenshot", () => {
    expect(replySchema.safeParse({ claimId: id }).success).toBe(false);
    expect(replySchema.safeParse({ claimId: id, note: "Here it is" }).success).toBe(true);
  });
});

describe("rejection messages (§17: neutral)", () => {
  it("OD-17: a wrong amount says it will be refunded", () => {
    expect(memberRejectionText("AMOUNT_MISMATCH")).toMatch(/refund/);
  });

  it("other reasons never reveal which check failed", () => {
    const texts = new Set(
      (["TRANSACTION_NOT_FOUND", "ALREADY_USED", "DETAILS_DO_NOT_MATCH", "EVIDENCE_UNCLEAR"] as const).map(
        memberRejectionText,
      ),
    );
    expect(texts.size).toBe(1);
  });
});

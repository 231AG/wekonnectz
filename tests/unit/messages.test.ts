import { describe, expect, it } from "vitest";

import { detect } from "@/lib/domain/detection";
import { conversationReportSchema, discoverFiltersSchema, messageSchema } from "@/lib/validation/messages";

const terms = { contact: ["whatsapp"], price: ["per hour"], money_request: ["send me money"] };
const id = "0d7b7c9e-6f4b-4a8e-9a55-2f1d1b7a1c11";

describe("message validation (§14)", () => {
  it("trims and accepts text up to 1000 characters", () => {
    expect(messageSchema.parse({ conversationId: id, body: "  hi  " }).body).toBe("hi");
    expect(messageSchema.safeParse({ conversationId: id, body: "a".repeat(1001) }).success).toBe(false);
    expect(messageSchema.safeParse({ conversationId: id, body: "   " }).success).toBe(false);
  });

  it("OD-31: in a conversation, money terms are flagged but contact details are not", () => {
    expect(detect("Send me 20 USD for transport", "conversation", terms).flagged).toBe(true);
    expect(detect("My number is 0777 123 456", "conversation", terms).flagged).toBe(false);
    expect(detect("Fancy a chat about music?", "conversation", terms).flagged).toBe(false);
  });

  it("photo reports are not accepted from a conversation", () => {
    expect(conversationReportSchema.safeParse({ conversationId: id, category: "INAPPROPRIATE_PHOTO" }).success).toBe(
      false,
    );
    expect(conversationReportSchema.safeParse({ conversationId: id, category: "MONEY_SCAM" }).success).toBe(true);
  });
});

describe("Discover filters (§15)", () => {
  it("accepts an adult age range, area and interests", () => {
    const r = discoverFiltersSchema.parse({ area: id, minAge: "25", maxAge: "40", interests: [id] });
    expect(r).toEqual({ area: id, minAge: 25, maxAge: 40, interests: [id] });
  });

  it("BR-4: refuses ages under 18", () => {
    expect(discoverFiltersSchema.safeParse({ minAge: "16" }).success).toBe(false);
  });
});

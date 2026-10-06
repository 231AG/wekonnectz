export type PhoneStepState =
  | { stage: "phone"; error?: string; phone?: string }
  | { stage: "code"; phone: string; maskedPhone: string; sentAt: number; error?: string; notice?: string };

export type AgeGateState = { error?: string; values?: { day: string; month: string; year: string } };

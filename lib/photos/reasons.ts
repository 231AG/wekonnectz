import type { Database } from "@/lib/supabase/database.types";

export type RejectionReason = Database["public"]["Enums"]["photo_rejection_reason"];

/**
 * Spec §11 photo content rules. `staff` is the queue button label; `member` is what the member reads:
 * neutral, says what to change, never accuses (spec §17 tone).
 */
export const REJECTION_REASONS: Record<RejectionReason, { staff: string; member: string }> = {
  FACE_NOT_CLEAR: {
    staff: "Face not clear (main photo)",
    member: "Your main photo needs to show your face clearly, on your own.",
  },
  NUDITY_OR_SEXUAL: {
    staff: "Nudity or sexual",
    member: "This photo isn’t allowed. Choose one without nudity or suggestive poses.",
  },
  TEXT_OR_CONTACT: {
    staff: "Text, numbers or handles",
    member: "Photos can’t include text, phone numbers, prices or social handles.",
  },
  CHILD_IN_PHOTO: {
    staff: "Child in photo",
    member: "Photos can’t include children.",
  },
  NOT_THE_MEMBER: {
    staff: "Not the member",
    member: "Use photos of yourself only.",
  },
  POOR_QUALITY: {
    staff: "Poor quality",
    member: "This photo is too dark or blurred. Try a clearer one.",
  },
};

export const REJECTION_REASON_KEYS = Object.keys(REJECTION_REASONS) as RejectionReason[];

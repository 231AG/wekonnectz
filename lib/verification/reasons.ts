import type { Database } from "@/lib/supabase/database.types";

export type VerificationRejectionReason = Database["public"]["Enums"]["verification_rejection_reason"];

/** Spec §9 reviewer checks. `staff`: queue label; `member`: neutral wording with what to do next. */
export const VERIFICATION_REASONS: Record<VerificationRejectionReason, { staff: string; member: string }> = {
  POSE_NOT_MATCHING: {
    staff: "Pose doesn’t match the prompt",
    member: "The pose didn’t match the instruction. Please try again with the new pose.",
  },
  NOT_SAME_PERSON: {
    staff: "Not the same person as the photos",
    member: "We couldn’t match your selfie to your profile photos. Use photos of yourself and try again.",
  },
  AGE_DOUBT: {
    staff: "May be under 18 (escalate)",
    member: "We need to take a closer look. Please try again; an administrator will review it.",
  },
  NOT_LIVE: {
    staff: "Photo of a screen or printout",
    member: "Take the selfie live with your camera, not a picture of a screen or a printed photo.",
  },
  UNCLEAR: {
    staff: "Face unclear (dark, blurred, covered)",
    member: "Your face wasn’t clear enough. Find good light and try again.",
  },
};

export const VERIFICATION_REASON_KEYS = Object.keys(VERIFICATION_REASONS) as VerificationRejectionReason[];

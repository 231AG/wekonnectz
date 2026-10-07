"use client";

import { useState } from "react";

import { VerificationMedia } from "@/components/admin/verification-media";
import { VerificationReviewForm } from "@/components/admin/verification-review-form";
import type { ReviewMedia, VerificationReviewState } from "@/lib/admin/verification-actions";

/**
 * The selfie, photos and decision form for ONE submission. The page renders it with
 * key={verificationId}, so switching submissions starts from scratch (no images or ticked boxes
 * carried over), and the form stays locked until this submission's selfie has loaded — which is also
 * when its view was logged. The database refuses a decision without that logged view.
 */
function VerificationPanel({
  verificationId,
  pose,
  locked,
  open,
  decide,
}: {
  verificationId: string;
  pose: string;
  locked: boolean;
  open: (id: string) => Promise<ReviewMedia>;
  decide: (prev: VerificationReviewState, formData: FormData) => Promise<VerificationReviewState>;
}) {
  const [ready, setReady] = useState(false);
  return (
    <>
      <VerificationMedia verificationId={verificationId} pose={pose} open={open} onReady={setReady} />
      <VerificationReviewForm verificationId={verificationId} action={decide} locked={locked || !ready} />
    </>
  );
}

export { VerificationPanel };

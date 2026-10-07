"use client";

import { useActionState, useState } from "react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import type { VerificationReviewState } from "@/lib/admin/verification-actions";
import { VERIFICATION_REASON_KEYS, VERIFICATION_REASONS } from "@/lib/verification/reasons";

/** Spec §9 reviewer checks. Approve needs every box ticked; reject needs a reason. */
const CHECKS = [
  "Pose matches the prompt",
  "Same person as the profile photos",
  "Clearly appears 18 or older",
  "No signs of a photo of a screen or printout",
];

function VerificationReviewForm({
  verificationId,
  action,
  locked,
}: {
  verificationId: string;
  action: (prev: VerificationReviewState, formData: FormData) => Promise<VerificationReviewState>;
  /** Escalated and the reviewer isn't an admin: they can look but not decide. */
  locked: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [ticked, setTicked] = useState<boolean[]>(CHECKS.map(() => false));
  const [reason, setReason] = useState("");
  const allTicked = ticked.every(Boolean);

  return (
    <form action={dispatch} className="flex flex-col gap-5">
      <input type="hidden" name="verificationId" value={verificationId} />
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Checklist</legend>
        {CHECKS.map((label, i) => (
          <label key={label} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              className="size-5 accent-pending"
              checked={ticked[i]}
              onChange={(e) => setTicked((t) => t.map((v, j) => (j === i ? e.target.checked : v)))}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor="reason" className="text-[13px] font-semibold text-muted-foreground">
          Rejection reason
        </label>
        <div className="flex gap-3">
          <select
            id="reason"
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-11 flex-1 rounded-control border-[1.5px] border-border bg-background px-3 text-[15px]"
          >
            <option value="">Choose a reason…</option>
            {VERIFICATION_REASON_KEYS.map((key) => (
              <option key={key} value={key}>
                {VERIFICATION_REASONS[key].staff}
              </option>
            ))}
          </select>
          <Button type="submit" name="decision" value="reject" variant="danger" size="md" disabled={pending || locked}>
            Reject
          </Button>
          <Button type="submit" name="decision" value="approve" size="md" disabled={pending || locked || !allTicked}>
            Approve
          </Button>
        </div>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}

export { VerificationReviewForm };

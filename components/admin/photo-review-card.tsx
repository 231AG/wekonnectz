"use client";

import { useActionState, useState } from "react";

import { FormError } from "@/components/layout/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReviewState } from "@/lib/admin/photo-actions";
import { REJECTION_REASON_KEYS, REJECTION_REASONS } from "@/lib/photos/reasons";

export type QueueItem = {
  photoId: string;
  memberLabel: string;
  isPrimary: boolean;
  position: number;
  waiting: string;
  approvedCount: number;
  url: string | null;
};

/** One photo in the queue (spec §21: approve / reject with reason). */
function PhotoReviewCard({
  item,
  action,
}: {
  item: QueueItem;
  action: (prev: ReviewState, formData: FormData) => Promise<ReviewState>;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [reason, setReason] = useState("");
  const headingId = `photo-${item.photoId}`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-card border border-border bg-surface-1"
    >
      <div className="relative aspect-[3/4] bg-surface-2">
        {item.url ? (
          // Short-lived signed URL from private storage (BR-11).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={`Photo ${item.position} from ${item.memberLabel}`}
            className="size-full object-cover"
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Photo unavailable</p>
        )}
        {item.isPrimary ? (
          <Badge tone="pending" className="absolute top-3 left-3">
            Main photo · face must be clear
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 id={headingId} className="font-bold">
            {item.memberLabel}
          </h2>
          <p className="text-sm text-muted-foreground">
            Photo {item.position} · {item.waiting} · {item.approvedCount} approved so far
          </p>
        </div>
        <form action={dispatch} className="mt-auto flex flex-col gap-3">
          <input type="hidden" name="photoId" value={item.photoId} />
          <label className="sr-only" htmlFor={`reason-${item.photoId}`}>
            Rejection reason
          </label>
          <select
            id={`reason-${item.photoId}`}
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-11 rounded-control border-[1.5px] border-border bg-background px-3 text-[15px]"
          >
            <option value="">Rejection reason…</option>
            {REJECTION_REASON_KEYS.map((key) => (
              <option key={key} value={key}>
                {REJECTION_REASONS[key].staff}
              </option>
            ))}
          </select>
          <FormError>{state.error}</FormError>
          <div className="flex gap-2">
            <Button
              type="submit"
              name="decision"
              value="reject"
              variant="danger"
              size="md"
              className="flex-1"
              disabled={pending}
            >
              Reject
            </Button>
            <Button type="submit" name="decision" value="approve" size="md" className="flex-1" disabled={pending}>
              Approve
            </Button>
          </div>
        </form>
      </div>
    </article>
  );
}

export { PhotoReviewCard };

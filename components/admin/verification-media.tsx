"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { ReviewMedia } from "@/lib/admin/verification-actions";

/**
 * Selfie and profile photos for one verification. Fetched on mount through a server action that logs
 * SELFIE_VIEWED before signing (BR-34): every mount — including a back/forward restore — is a logged
 * view, and nothing is ever rendered from a cached URL.
 */
function VerificationMedia({
  verificationId,
  pose,
  open,
}: {
  verificationId: string;
  pose: string;
  open: (id: string) => Promise<ReviewMedia>;
}) {
  const [media, setMedia] = useState<ReviewMedia | null>(null);

  useEffect(() => {
    let cancelled = false;
    open(verificationId)
      .then((m) => {
        if (!cancelled) setMedia(m);
      })
      .catch(() => {
        if (!cancelled)
          setMedia({ selfie: null, photos: [], error: "Couldn’t load the selfie. Refresh to try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [verificationId, open]);

  if (media?.error) return <p role="alert">{media.error}</p>;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <figure className="flex flex-col gap-2">
        <figcaption className="text-[13px] font-bold tracking-wide text-pending uppercase">
          Selfie · prompt: {pose}
        </figcaption>
        <div className="h-[280px] w-[220px] overflow-hidden rounded-card border-2 border-pending bg-surface-2">
          {media?.selfie ? (
            // Signed for 120 s right after the view was audited (BR-10, BR-34).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.selfie} alt="Verification selfie" className="size-full object-cover" />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{media ? "Selfie unavailable" : "Loading…"}</p>
          )}
        </div>
      </figure>
      <figure className="flex min-w-0 flex-1 flex-col gap-2">
        <figcaption className="text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
          Profile photos
        </figcaption>
        <div className="grid max-w-[600px] grid-cols-3 gap-3">
          {(media?.photos ?? []).map((p, i) => (
            <div key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-card bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Profile photo ${i + 1}`} className="size-full object-cover" />
              {p.status !== "APPROVED" ? (
                <Badge tone="pending" className="absolute bottom-2 left-2 px-2 py-0.5 text-[11px]">
                  In review
                </Badge>
              ) : null}
            </div>
          ))}
        </div>
      </figure>
    </div>
  );
}

export { VerificationMedia };

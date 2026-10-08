"use client";

import { useState, useTransition } from "react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";

/** The payment screenshot. Opening it is an explicit, audited view (§16: every view is logged). */
function ClaimEvidence({
  claimId,
  open,
}: {
  claimId: string;
  open: (claimId: string) => Promise<{ url?: string; error?: string }>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();
  if (url) {
    // Short-lived signed URL after the audited view.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="Payment screenshot" className="max-h-[520px] w-full rounded-control object-contain" />;
  }
  return (
    <div className="flex flex-col gap-2 rounded-control bg-background p-4">
      <p className="text-sm text-muted-foreground">Supporting evidence only. Opening it is logged.</p>
      <Button
        variant="secondary"
        size="md"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await open(claimId);
            if (r.url) setUrl(r.url);
            else setError(r.error);
          })
        }
      >
        Show screenshot
      </Button>
      <FormError>{error}</FormError>
    </div>
  );
}

export { ClaimEvidence };

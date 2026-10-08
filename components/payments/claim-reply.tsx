"use client";

import { useState, useTransition } from "react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { putToSignedUrl } from "@/lib/images/prepare-upload";
import type { ClaimFormState } from "@/lib/payments/claims/actions";

/** Answer an admin's question about a payment, with an optional new screenshot (§16 NEEDS_INFO). */
function ClaimReply({
  claimId,
  prepare,
  reply,
}: {
  claimId: string;
  prepare: () => Promise<{ evidenceId?: string; uploadUrl?: string; error?: string }>;
  reply: (input: { claimId: string; note?: string; evidenceId?: string }) => Promise<ClaimFormState>;
}) {
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [busy, start] = useTransition();

  if (sent)
    return (
      <p role="status" className="text-sm font-semibold text-success">
        Sent. We’ll check it again.
      </p>
    );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(undefined);
          let evidenceId: string | undefined;
          if (file) {
            const slot = await prepare();
            if (!slot.uploadUrl || !slot.evidenceId) return setError(slot.error ?? "Something went wrong. Try again.");
            if ((await putToSignedUrl(slot.uploadUrl, file)) !== "ok") {
              return setError("The screenshot didn’t upload. Check your connection and try again.");
            }
            evidenceId = slot.evidenceId;
          }
          const r = await reply({ claimId, note: note.trim() || undefined, evidenceId });
          if (r.error) setError(r.error);
          else setSent(true);
        });
      }}
    >
      <label htmlFor={`reply-${claimId}`} className="text-[13px] font-semibold text-muted-foreground">
        Your answer
      </label>
      <Textarea
        id={`reply-${claimId}`}
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-20"
      />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
          aria-label="New screenshot (optional)"
        />
      </label>
      <FormError>{error}</FormError>
      <Button type="submit" variant="secondary" size="md" disabled={busy}>
        {busy ? "Sending…" : "Send answer"}
      </Button>
    </form>
  );
}

export { ClaimReply };

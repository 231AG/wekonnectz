"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { prepareForUpload, putToSignedUrl } from "@/lib/images/prepare-upload";
import type { ClaimFormState } from "@/lib/payments/claims/actions";

type Submit = (input: {
  planId: string;
  provider: string;
  transactionId: string;
  senderPhone: string;
  paidAt: string;
  evidenceId: string;
}) => Promise<ClaimFormState>;

/** §16 step 4: transaction ID, sender number, locked amount, date and time, screenshot. */
function ClaimForm({
  planId,
  provider,
  amountLabel,
  defaultPhone,
  prepare,
  submit,
}: {
  planId: string;
  provider: string;
  amountLabel: string;
  defaultPhone: string;
  prepare: () => Promise<{ evidenceId?: string; uploadUrl?: string; error?: string }>;
  submit: Submit;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<ClaimFormState>({});
  const [sending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      setState({});
      if (!file) {
        setState({ error: "Add a screenshot of your payment.", field: "evidenceId" });
        return;
      }
      try {
        const slot = await prepare();
        if (!slot.uploadUrl || !slot.evidenceId) {
          setState({ error: slot.error ?? "Something went wrong. Try again." });
          return;
        }
        const outcome = await putToSignedUrl(slot.uploadUrl, await prepareForUpload(file));
        if (outcome !== "ok") {
          setState({
            error:
              outcome === "too-large"
                ? "That screenshot is too big. Use one under 10 MB."
                : outcome === "rejected"
                  ? "That file isn’t an image we can use. Use a JPG, PNG or WebP screenshot."
                  : "The screenshot didn’t upload. Check your connection and try again.",
          });
          return;
        }
        const result = await submit({
          planId,
          provider,
          transactionId: String(form.get("transactionId") ?? ""),
          senderPhone: String(form.get("senderPhone") ?? ""),
          paidAt: String(form.get("paidAt") ?? ""),
          evidenceId: slot.evidenceId,
        });
        if (result?.error) setState(result);
      } catch (err) {
        // redirect() from the server action surfaces as a navigation, not an error.
        if (err && typeof err === "object" && "digest" in err) throw err;
        setState({ error: "Something went wrong. Try again." });
      }
    });
  }

  const invalid = (f: string) => (state.field === f ? true : undefined);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="transactionId">Transaction ID</Label>
        <Input
          id="transactionId"
          name="transactionId"
          autoComplete="off"
          required
          maxLength={40}
          aria-invalid={invalid("transactionId")}
        />
        <p className="text-sm text-muted-foreground">Copy it exactly from the payment confirmation message.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="senderPhone">Number you paid from</Label>
        <Input
          id="senderPhone"
          name="senderPhone"
          inputMode="tel"
          defaultValue={defaultPhone}
          required
          aria-invalid={invalid("senderPhone")}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Amount</Label>
        <Input id="amount" value={amountLabel} readOnly aria-readonly="true" className="opacity-80" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="paidAt">When you paid</Label>
        <Input id="paidAt" name="paidAt" type="datetime-local" required aria-invalid={invalid("paidAt")} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">Screenshot of the payment</span>
        <input
          ref={fileInput}
          id="evidence"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          data-testid="evidence-input"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (preview) URL.revokeObjectURL(preview);
            setFile(f);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        <label
          htmlFor="evidence"
          className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-1 p-4 text-muted-foreground hover:bg-surface-2"
        >
          {preview ? (
            // Local preview of the chosen file; nothing is uploaded until you send.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your payment screenshot" className="max-h-56 rounded-xl object-contain" />
          ) : (
            <>
              <ImagePlus className="size-7" strokeWidth={1.6} aria-hidden />
              Add screenshot
            </>
          )}
        </label>
      </div>
      <FormError>{state.error}</FormError>
      <Button type="submit" variant="casual" disabled={sending}>
        {sending ? "Sending…" : "Submit payment"}
      </Button>
    </form>
  );
}

export { ClaimForm };

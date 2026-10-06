"use client";

import { useActionState, useEffect, useState } from "react";

import { OtpInput } from "@/components/auth/otp-input";
import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { PhoneStepState } from "@/lib/auth/actions/types";

const RESEND_SECONDS = 60; // matches Supabase Auth max_frequency

type Action = (prev: PhoneStepState, formData: FormData) => Promise<PhoneStepState>;

/** Phone number → SMS code (mock-up: onboarding 03). Used by sign-up and login. */
function PhoneOtpForm({ action }: { action: Action }) {
  const [state, dispatch, pending] = useActionState(action, { stage: "phone" } as PhoneStepState);
  const codeStage = state.stage === "code" ? state : null;
  const phoneError = state.stage === "phone" ? state.error : undefined;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <form action={dispatch} className="flex flex-col gap-2" noValidate>
        <input type="hidden" name="intent" value="send" />
        <Label htmlFor="phone">Phone number</Label>
        <div className="flex gap-2.5">
          <span
            aria-hidden
            className="flex min-h-[52px] items-center rounded-control border-[1.5px] border-border bg-surface-2 px-3.5 font-bold"
          >
            +231
          </span>
          <Input
            key={codeStage ? "locked" : "editable"}
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="77 012 3456"
            defaultValue={codeStage ? codeStage.maskedPhone.replace(/^\+231 /, "") : (state.phone ?? "")}
            readOnly={Boolean(codeStage)}
            aria-label="Phone number, Liberian (+231)"
            aria-invalid={phoneError ? true : undefined}
            aria-describedby="phone-error"
            required
          />
        </div>
        <FormError id="phone-error">{phoneError}</FormError>
        {!codeStage ? (
          <Button type="submit" disabled={pending} className="mt-2">
            {pending ? "Sending…" : "Send code"}
          </Button>
        ) : null}
      </form>

      {codeStage ? (
        <>
          <form id="verify-form" action={dispatch} className="flex flex-col gap-2" noValidate>
            <input type="hidden" name="intent" value="verify" />
            <input type="hidden" name="phone" value={codeStage.phone} />
            <Label htmlFor="code">Enter code</Label>
            <p className="sr-only">We sent a 6-digit code to {codeStage.maskedPhone}.</p>
            <OtpInput
              key={codeStage.sentAt}
              name="code"
              invalid={Boolean(codeStage.error)}
              describedBy="code-error"
              autoFocus
            />
            {codeStage.notice ? <p className="text-sm text-muted-foreground">{codeStage.notice}</p> : null}
            <FormError id="code-error">{codeStage.error}</FormError>
          </form>
          <ResendCode key={codeStage.sentAt} sentAt={codeStage.sentAt} phone={codeStage.phone} action={dispatch} />
          <div className="flex-1" />
          <Button type="submit" form="verify-form" disabled={pending}>
            {pending ? "Checking…" : "Verify"}
          </Button>
        </>
      ) : null}
    </div>
  );
}

function ResendCode({ sentAt, phone, action }: { sentAt: number; phone: string; action: (fd: FormData) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));

  if (left > 0) {
    const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    return <p className="text-[15px] text-muted-foreground">Resend code in {label}</p>;
  }
  return (
    <form action={action}>
      <input type="hidden" name="intent" value="send" />
      <input type="hidden" name="phone" value={phone} />
      <Button type="submit" variant="link" size="md" className="px-0">
        Resend code
      </Button>
    </form>
  );
}

export { PhoneOtpForm };

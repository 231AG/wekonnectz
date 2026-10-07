"use client";

import { useActionState, useState, useTransition } from "react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { EnrolState, StaffFormState } from "@/lib/auth/actions/staff";

type FormAction = (prev: StaffFormState, formData: FormData) => Promise<StaffFormState>;

function StaffLoginForm({ action }: { action: FormAction }) {
  const [state, dispatch, pending] = useActionState(action, {});
  return (
    <form action={dispatch} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>
        Continue
      </Button>
    </form>
  );
}

function CodeForm({ action, factorId, label }: { action: FormAction; factorId?: string; label: string }) {
  const [state, dispatch, pending] = useActionState(action, {});
  return (
    <form action={dispatch} className="flex flex-col gap-4" noValidate>
      {factorId ? <input type="hidden" name="factorId" value={factorId} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{label}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          className="font-display text-xl tracking-[0.3em]"
          required
        />
      </div>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>
        Verify
      </Button>
    </form>
  );
}

/** First sign-in: set up an authenticator app (TOTP), then confirm with a code. */
function TotpEnrolment({ start, verify }: { start: () => Promise<EnrolState>; verify: FormAction }) {
  const [enrolment, setEnrolment] = useState<EnrolState>({});
  const [pending, startTransition] = useTransition();

  if (!enrolment.factorId) {
    return (
      <div className="flex flex-col gap-4">
        <FormError>{enrolment.error}</FormError>
        <Button disabled={pending} onClick={() => startTransition(async () => setEnrolment(await start()))}>
          Set up authenticator app
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <ol className="list-decimal space-y-1 pl-5 text-[15px] text-muted-foreground">
        <li>Open your authenticator app (Google Authenticator, 1Password, Authy).</li>
        <li>Scan this code, or type the key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex items-center gap-5">
        {/* QR code as an SVG data URL from Supabase Auth; shown once, never stored by us. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={enrolment.qrCode}
          alt="QR code for your authenticator app"
          className="size-40 rounded-xl bg-white p-2"
        />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted-foreground">Key</p>
          <code data-testid="totp-secret" className="break-all text-sm">
            {enrolment.secret}
          </code>
        </div>
      </div>
      <CodeForm action={verify} factorId={enrolment.factorId} label="Code from your app" />
    </div>
  );
}

export { CodeForm, StaffLoginForm, TotpEnrolment };

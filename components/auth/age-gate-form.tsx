"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import type { AgeGateState } from "@/lib/auth/actions/types";

type Action = (prev: AgeGateState, formData: FormData) => Promise<AgeGateState>;

/** Date of birth entry (mock-up: onboarding 02). The only place DOB is asked (§10). */
function AgeGateForm({ action }: { action: Action }) {
  const [state, dispatch, pending] = useActionState(action, {} as AgeGateState);
  const invalid = state.error ? true : undefined;

  return (
    <form action={dispatch} className="flex flex-1 flex-col gap-5" noValidate>
      <fieldset className="grid grid-cols-[1fr_1fr_1.4fr] gap-2.5" aria-describedby="dob-error">
        <legend className="sr-only">Date of birth</legend>
        {(
          [
            ["day", "Day", "DD", 2, "bday-day"],
            ["month", "Month", "MM", 2, "bday-month"],
            ["year", "Year", "YYYY", 4, "bday-year"],
          ] as const
        ).map(([name, label, placeholder, max, autoComplete]) => (
          <div key={name} className="flex flex-col gap-2">
            <Label htmlFor={`dob-${name}`}>{label}</Label>
            <Input
              id={`dob-${name}`}
              name={name}
              inputMode="numeric"
              pattern="\d*"
              maxLength={max}
              placeholder={placeholder}
              autoComplete={autoComplete}
              defaultValue={state.values?.[name] ?? ""}
              aria-invalid={invalid}
              required
            />
          </div>
        ))}
      </fieldset>
      <FormError id="dob-error">{state.error}</FormError>
      <Card className="flex items-start gap-2.5 p-3.5">
        <Lock className="size-[18px] shrink-0 text-pending" strokeWidth={1.8} aria-hidden />
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          Your date of birth can’t be changed later. Only your age is shown on your profile.
        </p>
      </Card>
      <div className="flex-1" />
      <Button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}

export { AgeGateForm };

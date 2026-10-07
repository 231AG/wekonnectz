"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Ban, Lock, Shield, X } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StepAction, StepState } from "@/lib/onboarding/types";

import { useFieldErrors } from "./use-field-errors";

const RULES = [
  {
    icon: Ban,
    title: "No selling or buying sex",
    body: "Offering or asking for money, gifts or transport fare for sex gets you removed.",
  },
  { icon: Shield, title: "Adults only", body: "Everyone here is 18+. Report anyone who looks younger." },
  {
    icon: Lock,
    title: "No contact details or prices",
    body: "Keep numbers, handles and prices out of your bio and first messages.",
  },
  { icon: X, title: "Never ask for money", body: "Don’t request or send money to members." },
] as const;

/** Community rules & terms (spec §10 step 4, mock-up: onboarding 04). */
function RulesForm({
  action,
  versions,
}: {
  action: StepAction;
  versions: Record<"RULES" | "TERMS" | "PRIVACY", string>;
}) {
  const [state, dispatch, pending] = useActionState(action, {} as StepState);
  const { errorFor, onEdit } = useFieldErrors(state.errors);
  const error = errorFor("agree") ?? state.errors?.form;

  return (
    <form action={dispatch} onChange={onEdit} className="flex flex-1 flex-col gap-4" noValidate>
      {Object.entries(versions).map(([doc, version]) => (
        <input key={doc} type="hidden" name={doc} value={version} />
      ))}
      <ul className="flex flex-col gap-3.5">
        {RULES.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <Card className="flex gap-4">
              <Icon className="mt-0.5 size-6 shrink-0 text-pending" strokeWidth={1.8} aria-hidden />
              <div>
                <p className="text-[17px] font-bold">{title}</p>
                <p className="mt-1 text-[15px] leading-[22px] text-muted-foreground">{body}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <label className="flex min-h-11 cursor-pointer items-start gap-3.5 pt-1">
        <input
          type="checkbox"
          name="agree"
          className="mt-0.5 size-6 shrink-0 cursor-pointer accent-pending"
          aria-describedby="agree-error"
          aria-invalid={error ? true : undefined}
        />
        <span className="text-[15px] leading-[22px]">
          I agree to the Community rules,{" "}
          <Link href="/terms" target="_blank" className="text-pending underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="text-pending underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <FormError id="agree-error">{error}</FormError>
      <div className="flex-1" />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "I agree"}
      </Button>
    </form>
  );
}

export { RulesForm };

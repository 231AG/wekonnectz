"use client";

import { useActionState, useState } from "react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StepState } from "@/lib/onboarding/actions";

import { useFieldErrors } from "./use-field-errors";

type Action = (prev: StepState, formData: FormData) => Promise<StepState>;
export type InterestOption = { id: string; name: string };

const BIO_MAX = 500;

/** Interests (≥3) and bio (≤500) — spec §10 steps 7–8. No mock-up; built in the onboarding style. */
function InterestsForm({
  action,
  interests,
  defaults,
}: {
  action: Action;
  interests: InterestOption[];
  defaults: { interestIds: string[]; bio: string };
}) {
  const [state, dispatch, pending] = useActionState(action, {} as StepState);
  const values = (state.values as typeof defaults | undefined) ?? defaults;
  const { errorFor, onEdit } = useFieldErrors(state.errors);
  const e = { interestIds: errorFor("interestIds"), bio: errorFor("bio"), form: state.errors?.form };
  const [bioLength, setBioLength] = useState(values.bio.length);

  return (
    <form action={dispatch} onChange={onEdit} className="flex flex-1 flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-2" aria-describedby="interests-help interestIds-error">
        <legend className="mb-1 text-[13px] font-semibold text-muted-foreground">Interests</legend>
        <p id="interests-help" className="mb-1 text-[13px] text-muted-foreground">
          Choose at least 3.
        </p>
        <div className="flex flex-wrap gap-2">
          {interests.map((i) => (
            <ChoiceChip
              key={i.id}
              type="checkbox"
              name="interestIds"
              value={i.id}
              defaultChecked={values.interestIds.includes(i.id)}
              className="[&>span]:rounded-full"
            >
              {i.name}
            </ChoiceChip>
          ))}
        </div>
        <FormError id="interestIds-error">{e.interestIds}</FormError>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="bio">Bio</Label>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {bioLength}/{BIO_MAX}
          </span>
        </div>
        <Textarea
          id="bio"
          name="bio"
          maxLength={BIO_MAX}
          defaultValue={values.bio}
          placeholder="A few words about you. No phone numbers, handles, links or prices."
          onChange={(event) => setBioLength(event.target.value.length)}
          aria-invalid={e.bio ? true : undefined}
          aria-describedby="bio-error"
        />
        <FormError id="bio-error">{e.bio}</FormError>
      </div>

      <FormError>{e.form}</FormError>
      <div className="flex-1" />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

export { InterestsForm };

"use client";

import { useActionState, useState } from "react";
import { Flame, Heart } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { Input, Label } from "@/components/ui/input";
import type { StepState } from "@/lib/onboarding/actions";

import { useFieldErrors } from "./use-field-errors";

type Action = (prev: StepState, formData: FormData) => Promise<StepState>;
export type AreaOption = { id: string; county: string; name: string };
export type AboutDefaults = {
  displayName: string;
  gender: string;
  seeking: string[];
  areaId: string;
  intent: string;
};

const selectClass =
  "min-h-[52px] w-full rounded-control border-[1.5px] border-border bg-surface-1 px-4 text-base text-foreground focus-visible:border-pending focus-visible:outline-1 focus-visible:outline-pending aria-invalid:border-danger";

/** Basic profile + intent (spec §10 steps 5–6, mock-up: onboarding 05). Area from a list only (BR-20). */
function AboutForm({ action, areas, defaults }: { action: Action; areas: AreaOption[]; defaults: AboutDefaults }) {
  const [state, dispatch, pending] = useActionState(action, {} as StepState);
  const v = { ...defaults, ...(state.values as Partial<AboutDefaults> | undefined) };
  const { errorFor, onEdit } = useFieldErrors(state.errors);
  const e = {
    displayName: errorFor("displayName"),
    gender: errorFor("gender"),
    seeking: errorFor("seeking"),
    areaId: errorFor("areaId"),
    intent: errorFor("intent"),
    form: state.errors?.form,
  };

  const counties = [...new Set(areas.map((a) => a.county))].sort();
  const [county, setCounty] = useState(() => areas.find((a) => a.id === v.areaId)?.county ?? "");
  const communities = areas.filter((a) => a.county === county).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <form action={dispatch} onChange={onEdit} className="flex flex-1 flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="given-name"
          maxLength={30}
          defaultValue={v.displayName}
          aria-invalid={e.displayName ? true : undefined}
          aria-describedby="displayName-error"
        />
        <FormError id="displayName-error">{e.displayName}</FormError>
      </div>

      <fieldset className="flex flex-col gap-2" aria-describedby="gender-error">
        <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">I am</legend>
        <div className="flex gap-2">
          <ChoiceChip type="radio" name="gender" value="WOMAN" defaultChecked={v.gender === "WOMAN"}>
            Woman
          </ChoiceChip>
          <ChoiceChip type="radio" name="gender" value="MAN" defaultChecked={v.gender === "MAN"}>
            Man
          </ChoiceChip>
        </div>
        <FormError id="gender-error">{e.gender}</FormError>
      </fieldset>

      <fieldset className="flex flex-col gap-2" aria-describedby="seeking-error">
        <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">Interested in</legend>
        <div className="flex gap-2">
          <ChoiceChip type="checkbox" name="seeking" value="WOMAN" defaultChecked={v.seeking.includes("WOMAN")}>
            Women
          </ChoiceChip>
          <ChoiceChip type="checkbox" name="seeking" value="MAN" defaultChecked={v.seeking.includes("MAN")}>
            Men
          </ChoiceChip>
        </div>
        <FormError id="seeking-error">{e.seeking}</FormError>
      </fieldset>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="county">County</Label>
          <select
            id="county"
            className={selectClass}
            value={county}
            onChange={(event) => setCounty(event.target.value)}
          >
            <option value="">Choose…</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="areaId">Community</Label>
          <select
            key={county}
            id="areaId"
            name="areaId"
            className={selectClass}
            defaultValue={communities.some((a) => a.id === v.areaId) ? v.areaId : ""}
            disabled={!county}
            aria-invalid={e.areaId ? true : undefined}
            aria-describedby="areaId-error"
          >
            <option value="">Choose…</option>
            {communities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <FormError id="areaId-error">{e.areaId}</FormError>

      <fieldset className="flex flex-col gap-2" aria-describedby="intent-help intent-error">
        <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">Looking for</legend>
        <div className="flex gap-2.5">
          <ChoiceChip
            tone="card"
            type="radio"
            name="intent"
            value="RELATIONSHIP"
            defaultChecked={v.intent === "RELATIONSHIP"}
          >
            <Heart className="size-6 text-relationship" strokeWidth={1.8} aria-hidden />
            Relationship
          </ChoiceChip>
          <ChoiceChip tone="card" type="radio" name="intent" value="CASUAL" defaultChecked={v.intent === "CASUAL"}>
            <Flame className="size-6 text-casual" strokeWidth={1.8} aria-hidden />
            Casual
          </ChoiceChip>
          <ChoiceChip tone="card" type="radio" name="intent" value="BOTH" defaultChecked={v.intent === "BOTH"}>
            <span className="flex gap-1">
              <Heart className="size-6 text-relationship" strokeWidth={1.8} aria-hidden />
              <Flame className="size-6 text-casual" strokeWidth={1.8} aria-hidden />
            </span>
            Both
          </ChoiceChip>
        </div>
        <p id="intent-help" className="text-[13px] text-muted-foreground">
          Casual needs a pass. You can change this anytime.
        </p>
        <FormError id="intent-error">{e.intent}</FormError>
      </fieldset>

      <FormError>{e.form}</FormError>
      <div className="flex-1" />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

export { AboutForm };

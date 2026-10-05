"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";

import { cn } from "@/lib/utils";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-[15px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const unselected = "border-border bg-surface-1 text-foreground hover:bg-surface-2";
const selectedTone = {
  default: "border-transparent bg-pending text-on-accent",
  casual: "border-casual/60 bg-casual/15 text-casual",
};

type Tone = keyof typeof selectedTone;

// Radix sets data-state on each item; class names are written out in full so Tailwind can see them.
const radioState: Record<Tone, string> = {
  default:
    "data-[state=unchecked]:border-border data-[state=unchecked]:bg-surface-1 data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-surface-2 data-[state=checked]:border-transparent data-[state=checked]:bg-pending data-[state=checked]:text-on-accent",
  casual:
    "data-[state=unchecked]:border-border data-[state=unchecked]:bg-surface-1 data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-surface-2 data-[state=checked]:border-casual/60 data-[state=checked]:bg-casual/15 data-[state=checked]:text-casual",
};

/** Independent on/off chip, e.g. a filter (mock-ups: "Tonight", "Sinkor"). Uses `aria-pressed`. */
function Pill({
  className,
  selected = false,
  tone = "default",
  ...props
}: React.ComponentProps<"button"> & { selected?: boolean; tone?: Tone }) {
  return (
    <button
      type="button"
      data-slot="pill"
      aria-pressed={selected}
      className={cn(base, selected ? selectedTone[tone] : unselected, className)}
      {...props}
    />
  );
}

/**
 * One-of-a-set chips (mock-ups: "Woman / Man"). Radix RadioGroup gives the radio keyboard pattern:
 * one Tab stop for the group, arrow keys move and select.
 */
function PillRadioGroup({
  options,
  tone = "default",
  className,
  ...props
}: Omit<React.ComponentProps<typeof RadioGroup.Root>, "children"> & {
  options: { value: string; label: React.ReactNode }[];
  tone?: Tone;
}) {
  return (
    <RadioGroup.Root className={cn("flex flex-wrap gap-2", className)} {...props}>
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          data-slot="pill"
          className={cn(base, radioState[tone])}
        >
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

export { Pill, PillRadioGroup };

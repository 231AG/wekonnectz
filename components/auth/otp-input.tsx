"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Six-digit code entry (mock-up: onboarding 03). One real input (works with SMS autofill and
 * screen readers) drawn as six boxes; the active box gets the gold border.
 */
function OtpInput({
  name,
  length = 6,
  invalid,
  describedBy,
  autoFocus,
}: {
  name: string;
  length?: number;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);

  return (
    <div className="relative">
      <input
        id={name}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div aria-hidden className="flex justify-between gap-2">
        {Array.from({ length }, (_, i) => (
          <div
            key={i}
            className={cn(
              "flex h-14 w-[46px] items-center justify-center rounded-xl border-[1.5px] bg-surface-1 text-[22px] font-bold",
              focused && i === active ? "border-pending" : invalid ? "border-danger" : "border-border",
            )}
          >
            {value[i] ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export { OtpInput };

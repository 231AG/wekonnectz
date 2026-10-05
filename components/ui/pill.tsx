import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Choice chip (mock-ups: "Woman / Man", "Sinkor", "24–32").
 * - `mode="toggle"` (default): independent on/off chip → `aria-pressed`.
 * - `mode="radio"`: one of a set → `role="radio"` + `aria-checked`; wrap the set in
 *   an element with `role="radiogroup"` and an accessible name.
 */
function Pill({
  className,
  selected = false,
  mode = "toggle",
  tone = "default",
  ...props
}: React.ComponentProps<"button"> & {
  selected?: boolean;
  mode?: "toggle" | "radio";
  tone?: "default" | "casual";
}) {
  const state = mode === "radio" ? { role: "radio", "aria-checked": selected } : { "aria-pressed": selected };
  return (
    <button
      type="button"
      data-slot="pill"
      {...state}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-[15px] font-bold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? tone === "casual"
            ? "border-casual/60 bg-casual/15 text-casual"
            : "border-transparent bg-pending text-on-accent"
          : "border-border bg-surface-1 text-foreground hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export { Pill };

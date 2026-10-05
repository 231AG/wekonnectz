import * as React from "react";

import { cn } from "@/lib/utils";

/** Toggle chip used for choices and filters (mock-ups: "Woman / Man", "Sinkor", "24–32"). */
function Pill({
  className,
  selected = false,
  tone = "default",
  ...props
}: React.ComponentProps<"button"> & { selected?: boolean; tone?: "default" | "casual" }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-slot="pill"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-[15px] font-bold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? tone === "casual"
            ? "border-casual/60 bg-casual/15 text-casual"
            : "border-transparent bg-pending text-[#17140E]"
          : "border-border bg-surface-1 text-foreground hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export { Pill };

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Native radio/checkbox drawn as a chip (mock-ups: "Woman / Man", "Women / Men", interests).
 * Native inputs post with the form, keep built-in keyboard behaviour (arrow keys for radios)
 * and are announced correctly by screen readers.
 */
function ChoiceChip({
  type,
  name,
  value,
  defaultChecked,
  children,
  className,
  tone = "default",
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  defaultChecked?: boolean;
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "card";
}) {
  return (
    <label className={cn("relative inline-flex cursor-pointer", tone === "card" && "flex-1", className)}>
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        className={cn(
          "inline-flex min-h-11 w-full items-center justify-center gap-2 border-[1.5px] font-bold transition-colors",
          "border-border bg-surface-1 text-foreground",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          tone === "card"
            ? "min-h-[72px] flex-col rounded-control px-2 text-[13px] peer-checked:border-pending peer-checked:bg-pending/10"
            : "rounded-xl px-4 text-sm peer-checked:border-transparent peer-checked:bg-pending peer-checked:text-on-accent",
        )}
      >
        {children}
      </span>
    </label>
  );
}

export { ChoiceChip };

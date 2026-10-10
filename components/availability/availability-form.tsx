"use client";

import { useActionState, useState } from "react";
import { CalendarDays } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { AvailabilityFormState } from "@/lib/availability/actions";
import { formatHours } from "@/lib/domain/availability";
import { cn } from "@/lib/utils";

type Save = (prev: AvailabilityFormState, formData: FormData) => Promise<AvailabilityFormState>;

/** Available now / Schedule (member mock-up 08). Times are Liberia time (GMT). */
function AvailabilityForm({
  save,
  defaultStart,
  defaultEnd,
  todayLabel,
  maxWindowHours,
  submitLabel,
}: {
  save: Save;
  defaultStart: string;
  defaultEnd: string;
  todayLabel: string;
  maxWindowHours: number | null;
  submitLabel: string;
}) {
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [state, action, pending] = useActionState(save, {});
  // Controlled, so the chosen times survive a refused save.
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [endTime, setEndTime] = useState(defaultEnd.slice(11, 16));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="mode" value={mode} />
      <div className="flex gap-1.5 rounded-[14px] border border-border bg-surface-1 p-1" role="group" aria-label="When">
        {(["now", "schedule"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "min-h-11 flex-1 rounded-[10px] text-sm font-bold focus-visible:outline-2 focus-visible:outline-ring",
              mode === m ? "bg-surface-2 text-foreground" : "text-muted-foreground",
            )}
          >
            {m === "now" ? "Available now" : "Schedule"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3.5 rounded-card border border-border bg-surface-1 p-[18px]">
        <p className="flex items-center gap-2.5 text-[15px] font-bold">
          <CalendarDays className="size-5 text-pending" strokeWidth={1.8} aria-hidden />
          {mode === "now" ? `Today, ${todayLabel}` : "Choose a day and time"}
        </p>
        <div className={cn("grid grid-cols-1 gap-2.5", mode === "now" && "min-[380px]:grid-cols-2")}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="av-start">From</Label>
            {mode === "now" ? (
              <Input id="av-start" value="Now" readOnly aria-readonly="true" />
            ) : (
              <Input
                id="av-start"
                name="start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="av-end">Until</Label>
            {mode === "now" ? (
              <Input
                id="av-end"
                name="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            ) : (
              <Input
                id="av-end"
                name="end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            )}
          </div>
        </div>
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {maxWindowHours ? `Longest window: ${formatHours(maxWindowHours)}. ` : ""}
          {mode === "now" ? "A time that has already passed today means tomorrow. " : ""}
          You leave the pool automatically when it ends or your pass expires. Times are Liberia time (GMT).
        </p>
      </div>

      {state.error ? <FormError>{state.error}</FormError> : null}
      {state.saved ? (
        <p role="status" className="text-[15px] text-success">
          Saved.
        </p>
      ) : null}
      <Button type="submit" variant="casual" disabled={pending}>
        {pending ? "Saving…" : mode === "now" ? submitLabel : "Save schedule"}
      </Button>
    </form>
  );
}

export { AvailabilityForm };

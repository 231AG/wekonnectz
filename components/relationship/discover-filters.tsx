"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

const field = "min-h-11 w-full rounded-control border-[1.5px] border-border bg-background px-3 text-[15px]";

const WINDOWS = [
  ["any", "Any time"],
  ["2h", "Next 2 hours"],
  ["tonight", "Tonight"],
] as const;

/**
 * Discover filters (§15: area, age range, interests; gender comes from "interested in"). Also used by
 * Available Now (§13), which adds the availability window.
 */
function DiscoverFilters({
  areas,
  interests,
  current,
  action = "/relationship",
  withWindow = false,
}: {
  areas: { id: string; name: string }[];
  interests: { id: string; name: string }[];
  current: { area?: string; minAge?: number; maxAge?: number; interests?: string[]; window?: string };
  action?: string;
  withWindow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = Boolean(
    current.area ||
    current.minAge ||
    current.maxAge ||
    current.interests?.length ||
    (current.window && current.window !== "any"),
  );
  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        aria-label={active ? "Filters (on)" : "Filters"}
        aria-pressed={active}
        onClick={() => setOpen(true)}
        className={active ? "border-pending text-pending" : undefined}
      >
        <SlidersHorizontal className="size-5" strokeWidth={1.8} aria-hidden />
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Filters"
        description="You see people looking for someone like you."
      >
        <form method="get" action={action} className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
          <label className="flex flex-col gap-2 text-[13px] font-semibold text-muted-foreground">
            Area
            <select name="area" defaultValue={current.area ?? ""} className={field}>
              <option value="">Anywhere</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-[13px] font-semibold text-muted-foreground">
              Age from
              <input type="number" name="minAge" min={18} max={99} defaultValue={current.minAge} className={field} />
            </label>
            <label className="flex flex-col gap-2 text-[13px] font-semibold text-muted-foreground">
              Age to
              <input type="number" name="maxAge" min={18} max={99} defaultValue={current.maxAge} className={field} />
            </label>
          </div>
          {withWindow ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">Available</legend>
              <div className="flex flex-wrap gap-2">
                {WINDOWS.map(([value, label]) => (
                  <label
                    key={value}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm has-checked:border-pending has-checked:bg-surface-2"
                  >
                    <input
                      type="radio"
                      name="window"
                      value={value}
                      defaultChecked={(current.window ?? "any") === value}
                      className="size-4 accent-pending"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">Interests (any of)</legend>
            <div className="flex flex-wrap gap-2">
              {interests.map((i) => (
                <label
                  key={i.id}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm has-checked:border-pending has-checked:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    name="interests"
                    value={i.id}
                    defaultChecked={current.interests?.includes(i.id)}
                    className="size-4 accent-pending"
                  />
                  {i.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit">Show people</Button>
          <Button asChild variant="outline">
            <a href={action}>Clear filters</a>
          </Button>
        </form>
      </Sheet>
    </>
  );
}

export { DiscoverFilters };

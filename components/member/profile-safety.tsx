"use client";

import { useActionState, useState, useTransition } from "react";
import { Ban, Flag } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ReportState } from "@/lib/safety/actions";
import { REPORT_CATEGORIES, REPORT_CATEGORY_KEYS, type ReportCategory } from "@/lib/safety/categories";
import { cn } from "@/lib/utils";

/**
 * Report and block from a profile (spec §17: two taps). Blocking is silent; reports go to the
 * moderators' queue and the database applies the automatic actions.
 */
function ProfileSafety({
  targetId,
  name,
  photos,
  report,
  block,
}: {
  targetId: string;
  name: string;
  photos: { id: string; url: string }[];
  report: (prev: ReportState, formData: FormData) => Promise<ReportState>;
  block: (targetId: string) => Promise<{ error?: string }>;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [photoId, setPhotoId] = useState("");
  const [state, dispatch, sending] = useActionState(report, {});
  const [blocking, startBlocking] = useTransition();
  const [blockError, setBlockError] = useState<string>();

  function doBlock() {
    startBlocking(async () => {
      setBlockError(undefined);
      try {
        const result = await block(targetId);
        if (result?.error) setBlockError(result.error);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setBlockError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant="secondary" size="icon" aria-label={`Report ${name}`} onClick={() => setReportOpen(true)}>
          <Flag className="size-5" strokeWidth={1.8} aria-hidden />
        </Button>
        <Button variant="secondary" size="icon" aria-label={`Block ${name}`} onClick={() => setBlockOpen(true)}>
          <Ban className="size-5" strokeWidth={1.8} aria-hidden />
        </Button>
      </div>

      <Sheet
        open={reportOpen}
        onOpenChange={setReportOpen}
        title={state.done ? "Thanks for telling us" : `Report ${name}`}
        description={
          state.done
            ? "A moderator will review it. They won’t know who reported them."
            : "They won’t know you reported them."
        }
      >
        {state.done ? (
          <div className="flex flex-col gap-3">
            <Button
              variant="danger"
              onClick={() => {
                setReportOpen(false);
                setBlockOpen(true);
              }}
            >
              Also block {name}
            </Button>
            <Button variant="outline" onClick={() => setReportOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form action={dispatch} className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
            <input type="hidden" name="targetId" value={targetId} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">What’s wrong?</legend>
              {REPORT_CATEGORY_KEYS.map((key) => (
                <label
                  key={key}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border px-4 py-2.5 text-[15px]",
                    category === key && "border-pending bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="category"
                    value={key}
                    checked={category === key}
                    onChange={() => setCategory(key)}
                    className="size-5 accent-pending"
                  />
                  {REPORT_CATEGORIES[key].member}
                </label>
              ))}
            </fieldset>
            {category === "INAPPROPRIATE_PHOTO" ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">Which photo?</legend>
                <div className="flex gap-2">
                  {photos.map((p, i) => (
                    <label
                      key={p.id}
                      className={cn(
                        "relative size-20 cursor-pointer overflow-hidden rounded-xl border-2 border-transparent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                        photoId === p.id && "border-pending",
                      )}
                    >
                      <input
                        type="radio"
                        name="photoId"
                        value={p.id}
                        checked={photoId === p.id}
                        onChange={() => setPhotoId(p.id)}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                        aria-label={`Photo ${i + 1}`}
                      />
                      {/* Short-lived signed URL (BR-11). */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="size-full object-cover" />
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div className="flex flex-col gap-2">
              <label htmlFor="report-details" className="text-[13px] font-semibold text-muted-foreground">
                Details (optional)
              </label>
              <Textarea id="report-details" name="details" maxLength={500} className="min-h-20" />
            </div>
            <FormError>{state.error}</FormError>
            <Button type="submit" disabled={sending || !category}>
              {sending ? "Sending…" : "Send report"}
            </Button>
          </form>
        )}
      </Sheet>

      <Sheet
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title={`Block ${name}?`}
        description="They won’t be told. You won’t see each other anywhere, and no messages or requests can pass between you."
      >
        <FormError>{blockError}</FormError>
        <Button variant="danger" onClick={doBlock} disabled={blocking}>
          {blocking ? "Blocking…" : "Block"}
        </Button>
        <Button variant="outline" onClick={() => setBlockOpen(false)} disabled={blocking}>
          Cancel
        </Button>
      </Sheet>
    </>
  );
}

export { ProfileSafety };

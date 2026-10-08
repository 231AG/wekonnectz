"use client";

import { useActionState, useState, useTransition } from "react";
import { Ban, Flag } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationReportState } from "@/lib/messages/actions";
import { REPORT_CATEGORIES, REPORT_CATEGORY_KEYS } from "@/lib/safety/categories";
import { cn } from "@/lib/utils";

/** Report, block or unmatch from a conversation (spec §17: two taps; §14: closes for both). */
function ConversationSafety({
  conversationId,
  otherId,
  name,
  matchId,
  report,
  block,
  unmatch,
}: {
  conversationId: string;
  otherId: string;
  name: string;
  matchId: string | null;
  report: (prev: ConversationReportState, formData: FormData) => Promise<ConversationReportState>;
  block: (targetId: string) => Promise<{ error?: string }>;
  unmatch: (matchId: string) => Promise<{ error?: string }>;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string>();

  function run(fn: () => Promise<{ error?: string }>) {
    start(async () => {
      setError(undefined);
      try {
        const r = await fn();
        if (r?.error) setError(r.error);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="icon"
          aria-label={`Report ${name}`}
          onClick={() => {
            setDone(false);
            setOpened((n) => n + 1);
            setReportOpen(true);
          }}
        >
          <Flag className="size-5" strokeWidth={1.8} aria-hidden />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label={`Block or unmatch ${name}`}
          onClick={() => setBlockOpen(true)}
        >
          <Ban className="size-5" strokeWidth={1.8} aria-hidden />
        </Button>
      </div>

      <Sheet
        open={reportOpen}
        onOpenChange={setReportOpen}
        title={done ? "Thanks for telling us" : `Report ${name}`}
        description={
          done
            ? "A moderator will review it, with your recent messages. They won’t know who reported them."
            : "Your recent messages in this chat are shared with the moderator. They won’t know you reported them."
        }
      >
        {done ? (
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
          <ReportForm key={opened} conversationId={conversationId} report={report} onDone={() => setDone(true)} />
        )}
      </Sheet>

      <Sheet
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title={`Block or unmatch ${name}?`}
        description="Either one ends this chat for both of you. Blocking also hides you from each other everywhere; they won’t be told."
      >
        <FormError>{error}</FormError>
        <Button variant="danger" disabled={busy} onClick={() => run(() => block(otherId))}>
          Block
        </Button>
        {matchId ? (
          <Button variant="outline" disabled={busy} onClick={() => run(() => unmatch(matchId))}>
            Unmatch
          </Button>
        ) : null}
        <Button variant="ghost" disabled={busy} onClick={() => setBlockOpen(false)}>
          Cancel
        </Button>
      </Sheet>
    </>
  );
}

function ReportForm({
  conversationId,
  report,
  onDone,
}: {
  conversationId: string;
  report: (prev: ConversationReportState, formData: FormData) => Promise<ConversationReportState>;
  onDone: () => void;
}) {
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [state, dispatch, sending] = useActionState(async (prev: ConversationReportState, formData: FormData) => {
    const result = await report(prev, formData);
    if (result.done) onDone();
    return result;
  }, {});
  return (
    <form action={dispatch} className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
      <input type="hidden" name="conversationId" value={conversationId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">What’s wrong?</legend>
        {REPORT_CATEGORY_KEYS.filter((k) => k !== "INAPPROPRIATE_PHOTO").map((key) => (
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
      <div className="flex flex-col gap-2">
        <label htmlFor="conversation-report-details" className="text-[13px] font-semibold text-muted-foreground">
          Details (optional)
        </label>
        <Textarea
          id="conversation-report-details"
          name="details"
          maxLength={500}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="min-h-20"
        />
      </div>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={sending || !category}>
        {sending ? "Sending…" : "Send report"}
      </Button>
    </form>
  );
}

export { ConversationSafety };

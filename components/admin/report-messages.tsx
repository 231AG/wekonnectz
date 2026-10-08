"use client";

import { useState, useTransition } from "react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import type { CapturedMessages } from "@/lib/admin/report-actions";
import { cn } from "@/lib/utils";

/** Messages captured with a report. Opening them is an explicit, audited view (OD-26, OD-33). */
function ReportMessages({
  reportId,
  count,
  open,
}: {
  reportId: string;
  count: number;
  open: (reportId: string) => Promise<CapturedMessages>;
}) {
  const [result, setResult] = useState<CapturedMessages | null>(null);
  const [busy, start] = useTransition();
  if (!result?.messages) {
    return (
      <div className="flex flex-col gap-2 rounded-control bg-background p-4">
        <p className="text-[13px] font-semibold text-pending uppercase">From a conversation</p>
        <p className="text-sm text-muted-foreground">
          {count} recent message{count === 1 ? "" : "s"} captured. Opening them is logged.
        </p>
        <Button
          variant="secondary"
          size="md"
          disabled={busy || count === 0}
          onClick={() => start(async () => setResult(await open(reportId)))}
        >
          Show captured messages
        </Button>
        <FormError>{result?.error}</FormError>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-control bg-background p-4">
      <p className="text-[13px] font-semibold text-pending uppercase">Captured messages (view logged)</p>
      <ol className="flex flex-col gap-2" aria-label="Captured messages">
        {result.messages.map((m, i) => (
          <li key={i} className={cn("flex flex-col", m.fromReported ? "items-start" : "items-end")}>
            <span className="text-xs text-muted-foreground">
              {m.fromReported ? "Reported member" : "Reporter"} · {new Date(m.sentAt).toLocaleString("en-GB")}
            </span>
            <p
              className={cn(
                "max-w-[90%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
                m.fromReported ? "bg-danger/15" : "bg-surface-2",
              )}
            >
              {m.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export { ReportMessages };

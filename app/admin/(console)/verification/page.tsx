import Link from "next/link";

import { VerificationPanel } from "@/components/admin/verification-panel";
import { Badge } from "@/components/ui/badge";
import { openVerificationMedia, reviewVerificationAction } from "@/lib/admin/verification-actions";
import { requireStaff } from "@/lib/auth/staff";
import { timeAgo } from "@/lib/domain/time";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Verification queue" };

const RANK = { MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;

type Detail = {
  verification_id: string;
  pose_prompt: string;
  escalated: boolean;
  display_name: string | null;
  age: number | null;
  date_of_birth: string | null;
  area: string | null;
  intent_relationship: boolean | null;
  intent_casual: boolean | null;
  previous_rejections: number;
};

function formatDob(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Spec §21 verification queue (admin mock-up 02): oldest first; profile photos beside the selfie and
 * pose; checklist; approve / reject with reason. The selfie loads client-side through an action that
 * records SELFIE_VIEWED before signing (BR-34) — every display is a logged view. Items open only from
 * explicit links (never prefetched).
 */
export default async function VerificationQueuePage({ searchParams }: PageProps<"/admin/verification">) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { id } = await searchParams;
  const selectedId = typeof id === "string" ? id : undefined;

  const { data: rows, error: queueError } = await supabase.rpc("staff_verification_queue", { p_limit: 50 });
  const queue = queueError ? [] : (rows ?? []);

  let detail: Detail | null = null;
  let detailError: string | null = null;
  if (selectedId && /^[0-9a-f-]{36}$/i.test(selectedId)) {
    // Details only (no selfie): the selfie loads in <VerificationMedia>, which logs each view first.
    const { data } = await supabase.rpc("staff_verification_detail", { p_verification_id: selectedId });
    detail = (data as Detail | null) ?? null;
    if (!detail) detailError = "This submission was already decided or doesn’t exist.";
  }
  const canDecide = detail ? !detail.escalated || RANK[staff.role] >= RANK.ADMIN : false;
  const intent = detail
    ? [detail.intent_relationship ? "Relationship" : "", detail.intent_casual ? "Casual" : ""]
        .filter(Boolean)
        .join(" + ")
    : "";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[34px] font-bold">Verification queue</h1>
        <p className="text-muted-foreground">Oldest first · each selfie view is logged</p>
      </div>
      {queueError ? <p role="alert">The queue couldn’t load. Refresh to try again.</p> : null}
      <div className="flex items-start gap-6">
        <nav aria-label="Submissions" className="w-[300px] shrink-0 rounded-card border border-border bg-surface-1 p-3">
          {queue.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No selfies waiting.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {queue.map((q) => (
                <li key={q.verification_id}>
                  <Link
                    href={`/admin/verification?id=${q.verification_id}`}
                    prefetch={false}
                    aria-current={q.verification_id === selectedId ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 flex-col rounded-xl px-3 py-2.5 hover:bg-surface-2",
                      q.verification_id === selectedId && "bg-surface-2",
                    )}
                  >
                    <span className="font-bold">{q.display_name ?? "Member"}</span>
                    <span className="text-sm text-muted-foreground">
                      {q.previous_rejections > 0 ? "Resubmission · " : "Submitted "}
                      {timeAgo(q.submitted_at)}
                    </span>
                    {q.escalated ? (
                      <Badge tone="danger" className="mt-1 self-start">
                        Escalated · admin
                      </Badge>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <section aria-label="Submission" className="min-w-0 flex-1 rounded-card border border-border bg-surface-1 p-6">
          {detailError ? <p role="alert">{detailError}</p> : null}
          {!detail && !detailError ? (
            <p className="text-muted-foreground">
              {queue.length ? "Choose a submission to review. Opening it records that you viewed the selfie." : ""}
            </p>
          ) : null}
          {detail ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-[26px] font-bold">
                  {detail.display_name ?? "Member"}, {detail.age}
                </h2>
                {detail.area ? <Badge tone="neutral">{detail.area}</Badge> : null}
                {intent ? <Badge tone="neutral">{intent}</Badge> : null}
                <Badge tone="neutral">DOB {formatDob(detail.date_of_birth)}</Badge>
                {detail.escalated ? <Badge tone="danger">Escalated · admin decides</Badge> : null}
              </div>

              {detail.previous_rejections > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {detail.previous_rejections} earlier selfie{detail.previous_rejections === 1 ? " was" : "s were"}{" "}
                  rejected.
                </p>
              ) : null}
              {!canDecide ? (
                <p role="status" className="text-sm text-danger">
                  Escalated: only an admin can approve or reject this one.
                </p>
              ) : null}
              <VerificationPanel
                key={detail.verification_id}
                verificationId={detail.verification_id}
                pose={detail.pose_prompt}
                locked={!canDecide}
                open={openVerificationMedia}
                decide={reviewVerificationAction}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

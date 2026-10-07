import Link from "next/link";

import { VerificationReviewForm } from "@/components/admin/verification-review-form";
import { Badge } from "@/components/ui/badge";
import { reviewVerificationAction } from "@/lib/admin/verification-actions";
import { requireStaff } from "@/lib/auth/staff";
import { timeAgo } from "@/lib/domain/time";
import { signVerificationReview } from "@/lib/storage/verification";
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
 * pose; checklist; approve / reject with reason. Opening an item records SELFIE_VIEWED before the
 * selfie URL is created (BR-34). Items open only from an explicit link (never prefetched), so a
 * list render or a hover never counts as a view.
 */
export default async function VerificationQueuePage({ searchParams }: PageProps<"/admin/verification">) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { id } = await searchParams;
  const selectedId = typeof id === "string" ? id : undefined;

  const { data: rows, error: queueError } = await supabase.rpc("staff_verification_queue", { p_limit: 50 });
  const queue = queueError ? [] : (rows ?? []);

  let detail: Detail | null = null;
  let media: Awaited<ReturnType<typeof signVerificationReview>> | null = null;
  let detailError: string | null = null;
  if (selectedId && /^[0-9a-f-]{36}$/i.test(selectedId)) {
    const { data } = await supabase.rpc("staff_verification_detail", { p_verification_id: selectedId });
    detail = (data as Detail | null) ?? null;
    if (!detail) {
      detailError = "This submission was already decided or doesn’t exist.";
    } else {
      // Audit first; no audit row → no selfie URL.
      const { error: logError } = await supabase.rpc("log_selfie_view", { p_verification_id: selectedId });
      if (logError) {
        detail = null;
        detailError = logError.message.includes("OWN_CONTENT")
          ? "You can’t review your own account."
          : "This submission was already decided or doesn’t exist.";
      } else {
        media = await signVerificationReview(selectedId);
      }
    }
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
          {detail && media ? (
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
              <div className="flex flex-wrap items-start gap-6">
                <figure className="flex flex-col gap-2">
                  <figcaption className="text-[13px] font-bold tracking-wide text-pending uppercase">
                    Selfie · prompt: {detail.pose_prompt}
                  </figcaption>
                  <div className="h-[280px] w-[220px] overflow-hidden rounded-card border-2 border-pending bg-surface-2">
                    {media.selfie ? (
                      // Signed for 120 s, after the view was audited (BR-10, BR-34).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={media.selfie} alt="Verification selfie" className="size-full object-cover" />
                    ) : (
                      <p className="p-4 text-sm text-muted-foreground">Selfie unavailable</p>
                    )}
                  </div>
                </figure>
                <figure className="flex min-w-0 flex-1 flex-col gap-2">
                  <figcaption className="text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
                    Profile photos
                  </figcaption>
                  <div className="grid max-w-[600px] grid-cols-3 gap-3">
                    {media.photos.map((p, i) => (
                      <div key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-card bg-surface-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={`Profile photo ${i + 1}`} className="size-full object-cover" />
                        {p.status !== "APPROVED" ? (
                          <Badge tone="pending" className="absolute bottom-2 left-2 px-2 py-0.5 text-[11px]">
                            In review
                          </Badge>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </figure>
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
              <VerificationReviewForm
                verificationId={detail.verification_id}
                action={reviewVerificationAction}
                locked={!canDecide}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

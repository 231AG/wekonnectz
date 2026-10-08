import Link from "next/link";

import { MemberActions } from "@/components/admin/member-actions";
import { NoteField } from "@/components/admin/note-field";
import { StaffForm, StaffSubmit } from "@/components/admin/staff-form";
import { Badge } from "@/components/ui/badge";
import { addReportNoteAction, resolveReportAction } from "@/lib/admin/report-actions";
import { requireStaff } from "@/lib/auth/staff";
import { timeAgo } from "@/lib/domain/time";
import { REJECTION_REASON_KEYS, REJECTION_REASONS } from "@/lib/photos/reasons";
import { accountRef, REPORT_CATEGORIES, type ReportCategory, type ReportPriority } from "@/lib/safety/categories";
import { signReportPhotos } from "@/lib/storage/profiles";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

const RANK = { MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;
const PRIORITY_TONE = { HIGH: "danger", MEDIUM: "pending", LOW: "neutral" } as const;
const PRIORITIES: ReportPriority[] = ["HIGH", "MEDIUM", "LOW"];
const select = "min-h-11 rounded-control border-[1.5px] border-border bg-background px-3 text-[15px]";

type Detail = {
  report_id: string;
  category: ReportCategory;
  priority: ReportPriority;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  description: string | null;
  photo_id: string | null;
  created_at: string;
  reported_user_id: string;
  display_name: string | null;
  age: number | null;
  account_status: string;
  stored_status: string;
  suspended_until: string | null;
  hidden_reason: string | null;
  verification: string;
  reporters_24h: number;
  other_reports: { category: ReportCategory; status: string; created_at: string }[];
  notes: { note: string; created_at: string; mine: boolean }[];
};

function hiddenLabel(reason: string | null) {
  if (reason === "UNDER_18_REPORT") return "Hidden: under-18 report";
  if (reason === "REPORT_THRESHOLD") return "Hidden: report threshold";
  return null;
}

/**
 * Spec §21 Reports queue (admin mock-up 03): priority first; investigate, add internal notes,
 * suspend, ban (admin), dismiss or resolve. Every decision is audited in the database (BR-34).
 */
export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const sp = await searchParams;
  const selectedId = typeof sp.id === "string" && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : undefined;
  const priority = PRIORITIES.find((p) => p === sp.priority);
  const includeClosed = sp.closed === "1";
  const memberId = typeof sp.member === "string" && /^[0-9a-f-]{36}$/i.test(sp.member) ? sp.member : undefined;
  const isAdmin = RANK[staff.role] >= RANK.ADMIN;

  const { data: rows, error: queueError } = await supabase.rpc("staff_reports_queue", {
    p_include_closed: includeClosed,
    p_limit: 200,
  });
  const all = (queueError ? [] : (rows ?? [])).filter((r) => !memberId || r.reported_user_id === memberId);
  const shown = priority ? all.filter((r) => r.priority === priority) : all;

  const href = (next: { priority?: ReportPriority | null; closed?: boolean; id?: string }) => {
    const q = new URLSearchParams();
    const p = next.priority === undefined ? priority : next.priority;
    if (p) q.set("priority", p);
    if (next.closed ?? includeClosed) q.set("closed", "1");
    if (memberId) q.set("member", memberId);
    if (next.id) q.set("id", next.id);
    const s = q.toString();
    return s ? `/admin/reports?${s}` : "/admin/reports";
  };

  let detail: Detail | null = null;
  let photos: Awaited<ReturnType<typeof signReportPhotos>> = [];
  if (selectedId) {
    const { data } = await supabase.rpc("staff_report_detail", { p_report_id: selectedId });
    detail = (data as Detail | null) ?? null;
    if (detail) photos = await signReportPhotos(selectedId);
  }
  const reportedPhoto = detail?.photo_id ? photos.find((p) => p.id === detail.photo_id) : undefined;
  const photoStillHidden = reportedPhoto?.status === "HIDDEN";
  const isOpen = detail?.status === "OPEN";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[34px] font-bold">Reports</h1>
        <p className="text-muted-foreground">
          Priority first · actions are audit-logged
          {memberId ? (
            <>
              {" "}
              · showing {accountRef(memberId)} ·{" "}
              <Link href="/admin/reports" className="underline underline-offset-4">
                show all
              </Link>
            </>
          ) : null}
        </p>
      </div>
      {queueError ? <p role="alert">The queue couldn’t load. Refresh to try again.</p> : null}

      <nav aria-label="Filters" className="flex flex-wrap gap-2">
        {[null, ...PRIORITIES].map((p) => {
          const count = p ? all.filter((r) => r.priority === p).length : all.length;
          const active = (p ?? undefined) === priority;
          return (
            <Link
              key={p ?? "ALL"}
              href={href({ priority: p })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[15px] font-semibold hover:bg-surface-2",
                active && (p === "HIGH" ? "border-danger/50 bg-danger/15 text-danger" : "bg-surface-2"),
              )}
            >
              {p ? p[0] + p.slice(1).toLowerCase() : "All"} · {count}
            </Link>
          );
        })}
        <Link
          href={href({ closed: !includeClosed })}
          aria-pressed={!includeClosed}
          className={cn(
            "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[15px] font-semibold hover:bg-surface-2",
            !includeClosed && "bg-surface-2",
          )}
        >
          Open only
        </Link>
      </nav>

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-border bg-surface-1">
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-border text-sm text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Reported</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Age</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                    No reports here.
                  </td>
                </tr>
              ) : null}
              {shown.map((r) => {
                const status =
                  r.status !== "OPEN"
                    ? r.status === "RESOLVED"
                      ? "Resolved"
                      : "Dismissed"
                    : r.target_hidden
                      ? r.reporters_24h > 1
                        ? `${r.reporters_24h} reports · auto-hidden`
                        : "Auto-hidden"
                      : r.reporters_24h > 1
                        ? `${r.reporters_24h} reports · open`
                        : "Open";
                return (
                  <tr
                    key={r.report_id}
                    className={cn("border-b border-border last:border-0", r.report_id === selectedId && "bg-surface-2")}
                  >
                    <td className="px-4 py-3">
                      <Badge tone={PRIORITY_TONE[r.priority]}>{r.priority}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={href({ id: r.report_id })}
                        prefetch={false}
                        aria-current={r.report_id === selectedId ? "page" : undefined}
                        className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                      >
                        {REPORT_CATEGORIES[r.category].staff}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{accountRef(r.reported_user_id)}</td>
                    <td className="px-4 py-3">{status}</td>
                    <td className="px-4 py-3 text-muted-foreground">{timeAgo(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section aria-label="Report" className="w-[440px] shrink-0 rounded-card border border-border bg-surface-1 p-6">
          {selectedId && !detail ? <p role="alert">This report doesn’t exist.</p> : null}
          {!selectedId ? <p className="text-muted-foreground">Choose a report to investigate.</p> : null}
          {detail ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <Badge tone={PRIORITY_TONE[detail.priority]}>{detail.priority}</Badge>
                <h2 className="font-display text-[20px] font-bold">{REPORT_CATEGORIES[detail.category].staff}</h2>
              </div>
              <div>
                <p className="font-display text-[18px] font-bold">{accountRef(detail.reported_user_id)}</p>
                <p className="text-sm text-muted-foreground">
                  {detail.display_name ?? "Member"}
                  {detail.age ? `, ${detail.age}` : ""} ·{" "}
                  {detail.verification === "VERIFIED" ? "Verified" : "Not verified"} ·{" "}
                  {detail.account_status.toLowerCase()}
                  {detail.suspended_until
                    ? ` until ${new Date(detail.suspended_until).toLocaleDateString("en-GB")}`
                    : ""}{" "}
                  · {detail.reporters_24h} distinct reporter{detail.reporters_24h === 1 ? "" : "s"} (24 h)
                </p>
                {hiddenLabel(detail.hidden_reason) ? (
                  <Badge tone="danger" className="mt-2">
                    {hiddenLabel(detail.hidden_reason)}
                  </Badge>
                ) : null}
                <p className="mt-1 text-sm text-muted-foreground">
                  Reported {timeAgo(detail.created_at)} · {detail.status.toLowerCase()}
                </p>
              </div>

              {detail.description ? (
                <div className="rounded-control bg-background p-4">
                  <p className="text-[13px] font-semibold text-pending uppercase">Reporter’s details</p>
                  <p className="mt-1 text-[15px] break-words whitespace-pre-wrap">{detail.description}</p>
                </div>
              ) : null}

              {photos.length ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[13px] font-semibold text-muted-foreground">Photos</p>
                  <div className="flex flex-wrap gap-2">
                    {photos.map((p) => (
                      <figure key={p.id} className="flex flex-col gap-1">
                        {/* Short-lived signed URL after requireStaff (BR-11). */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.isReported ? "Reported photo" : "Member photo"}
                          className={cn("size-24 rounded-xl object-cover", p.isReported && "ring-2 ring-danger")}
                        />
                        <figcaption className="text-xs text-muted-foreground">
                          {p.isReported ? "Reported · " : ""}
                          {p.status.toLowerCase().replace("_", " ")}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.other_reports.length ? (
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold">Other reports about this member</p>
                  <ul>
                    {detail.other_reports.slice(0, 5).map((o, i) => (
                      <li key={i}>
                        {REPORT_CATEGORIES[o.category].staff} · {o.status.toLowerCase()} · {timeAgo(o.created_at)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detail.notes.length ? (
                <ul className="flex flex-col gap-2" aria-label="Internal notes">
                  {detail.notes.map((n, i) => (
                    <li key={i} className="rounded-control bg-background p-3 text-sm">
                      <p className="break-words whitespace-pre-wrap">{n.note}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {n.mine ? "You" : "Staff"} · {timeAgo(n.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              <StaffForm action={addReportNoteAction} label="Add internal note" key={`note-${detail.notes.length}`}>
                <input type="hidden" name="reportId" value={detail.report_id} />
                <NoteField />
                <StaffSubmit variant="secondary">Add note</StaffSubmit>
              </StaffForm>

              {isOpen ? (
                <StaffForm action={resolveReportAction} label="Close report">
                  <input type="hidden" name="reportId" value={detail.report_id} />
                  {detail.hidden_reason ? (
                    <label className="flex min-h-11 items-center gap-3 text-[15px]">
                      <input type="checkbox" name="restoreVisibility" className="size-5 accent-pending" />
                      Also make the member visible again
                    </label>
                  ) : null}
                  {photoStillHidden ? (
                    <div className="flex flex-col gap-2">
                      <label htmlFor="photoReason" className="text-[13px] font-semibold text-muted-foreground">
                        Reported photo (hidden)
                      </label>
                      <select id="photoReason" name="photoReason" className={select} defaultValue="">
                        <option value="">Put it back (approved)</option>
                        {REJECTION_REASON_KEYS.map((k) => (
                          <option key={k} value={k}>
                            Reject: {REJECTION_REASONS[k].staff}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <StaffSubmit name="outcome" value="dismiss" variant="outline">
                      Dismiss
                    </StaffSubmit>
                    <StaffSubmit name="outcome" value="resolve">
                      Resolve
                    </StaffSubmit>
                  </div>
                </StaffForm>
              ) : null}

              <MemberActions
                userId={detail.reported_user_id}
                reportId={detail.report_id}
                storedStatus={detail.stored_status}
                suspendedUntil={detail.suspended_until}
                hiddenReason={detail.hidden_reason}
                isAdmin={isAdmin}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

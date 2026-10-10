import Link from "next/link";
import { notFound } from "next/navigation";

import { Cell, controlClass, DataTable, PageHeader, Panel, Row, titleCase, when } from "@/components/admin/console-ui";
import { MemberActions } from "@/components/admin/member-actions";
import { StaffForm, StaffSubmit } from "@/components/admin/staff-form";
import { Badge } from "@/components/ui/badge";
import { correctDobAction } from "@/lib/admin/console-actions";
import { requireStaff } from "@/lib/auth/staff";
import { formatUsd } from "@/lib/domain/money";
import { accountRef, REPORT_CATEGORIES, type ReportCategory } from "@/lib/safety/categories";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Member" };

type Detail = {
  user_id: string;
  display_name: string | null;
  age: number | null;
  area: string | null;
  gender: string | null;
  intent_relationship: boolean | null;
  intent_casual: boolean | null;
  bio: string | null;
  status: string;
  effective_status: string;
  suspended_until: string | null;
  hidden_reason: string | null;
  deleted_at: string | null;
  created_at: string;
  verification: string;
  photos_approved: number;
  photos_pending: number;
  in_pool: boolean;
  reports_against: { id: string; category: ReportCategory; priority: string; status: string; created_at: string }[];
  reports_filed: number;
  flags_open: { reason: string; created_at: string }[];
  subscriptions:
    { id: string; plan: string; source: string; status: string; starts_at: string; expires_at: string }[] | null;
  payments:
    | {
        id: string;
        source: string;
        provider: string | null;
        amount: number;
        currency: string;
        status: string;
        paid_at: string | null;
      }[]
    | null;
  audit: { action: string; actor: string | null; at: string; metadata: Record<string, unknown> }[] | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One member (spec §21 Users → View): moderation data for all staff; access, payments and audit trail for admins (§7). */
export default async function UserDetailPage({ params }: PageProps<"/admin/users/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { data } = await (await createClient()).rpc("staff_user_detail", { p_user: id });
  const d = data as Detail | null;
  if (!d) notFound();
  const isAdmin = staff.role !== "MODERATOR";
  const intents =
    [d.intent_relationship && "Relationship", d.intent_casual && "Casual"].filter(Boolean).join(" · ") || "—";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.display_name ? `${d.display_name}${d.age ? `, ${d.age}` : ""}` : "No profile yet"}
        subtitle={`${accountRef(d.user_id)} · joined ${when(d.created_at)}`}
      >
        <Link href="/admin/users" className="inline-flex min-h-11 items-center underline underline-offset-4">
          All users
        </Link>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Account">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] md:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd>
                  <Badge
                    tone={
                      d.effective_status === "ACTIVE"
                        ? "approved"
                        : d.effective_status === "PENDING"
                          ? "pending"
                          : "danger"
                    }
                  >
                    {d.effective_status}
                  </Badge>
                  {d.suspended_until ? <span className="ml-2 text-sm">until {when(d.suspended_until)}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Verification</dt>
                <dd>{titleCase(d.verification)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Photos</dt>
                <dd>
                  {d.photos_approved} approved{d.photos_pending ? ` · ${d.photos_pending} waiting` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Looking for</dt>
                <dd>{intents}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Area</dt>
                <dd>{d.area ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Available now</dt>
                <dd>{d.in_pool ? "Yes" : "No"}</dd>
              </div>
              {d.hidden_reason ? (
                <div>
                  <dt className="text-sm text-muted-foreground">Visibility</dt>
                  <dd className="text-danger">Hidden ({titleCase(d.hidden_reason)})</dd>
                </div>
              ) : null}
              {d.deleted_at ? (
                <div>
                  <dt className="text-sm text-muted-foreground">Deleted</dt>
                  <dd>{when(d.deleted_at)}</dd>
                </div>
              ) : null}
            </dl>
            {d.bio ? <p className="text-[15px] whitespace-pre-line text-muted-foreground">{d.bio}</p> : null}
          </Panel>

          <Panel title={`Reports about this member · ${d.reports_against.length}`}>
            {d.reports_against.length ? (
              <ul className="flex flex-col gap-2 text-[15px]">
                {d.reports_against.map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/reports?id=${r.id}&closed=1`} className="underline-offset-4 hover:underline">
                      {REPORT_CATEGORIES[r.category].staff}
                    </Link>{" "}
                    · {titleCase(r.priority)} · {titleCase(r.status)} · {when(r.created_at)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">None.</p>
            )}
            <p className="text-sm text-muted-foreground">Reports this member filed: {d.reports_filed}</p>
            {d.flags_open.length ? (
              <p className="text-sm">
                Open flags: {d.flags_open.map((f) => titleCase(f.reason)).join(", ")} ·{" "}
                <Link href="/admin/flags" className="underline underline-offset-4">
                  Flags queue
                </Link>
              </p>
            ) : null}
          </Panel>

          {isAdmin && d.subscriptions ? (
            <Panel title="Subscriptions">
              <DataTable
                label="Subscriptions"
                head={["Plan", "Source", "Status", "From", "Until"]}
                empty={d.subscriptions.length === 0}
              >
                {d.subscriptions.map((s) => (
                  <Row key={s.id}>
                    <Cell>
                      <Link href={`/admin/subscriptions?id=${s.id}`} className="underline-offset-4 hover:underline">
                        {s.plan}
                      </Link>
                    </Cell>
                    <Cell>{titleCase(s.source)}</Cell>
                    <Cell>{titleCase(s.status)}</Cell>
                    <Cell>{when(s.starts_at)}</Cell>
                    <Cell>{when(s.expires_at)}</Cell>
                  </Row>
                ))}
              </DataTable>
            </Panel>
          ) : null}

          {isAdmin && d.payments ? (
            <Panel title="Payments">
              <DataTable label="Payments" head={["Amount", "Source", "Status", "Paid"]} empty={d.payments.length === 0}>
                {d.payments.map((p) => (
                  <Row key={p.id}>
                    <Cell>
                      <Link href={`/admin/transactions?id=${p.id}`} className="underline-offset-4 hover:underline">
                        {formatUsd(Number(p.amount))} {p.currency}
                      </Link>
                    </Cell>
                    <Cell>{titleCase(p.provider ?? p.source)}</Cell>
                    <Cell>{titleCase(p.status)}</Cell>
                    <Cell>{when(p.paid_at)}</Cell>
                  </Row>
                ))}
              </DataTable>
            </Panel>
          ) : null}

          {isAdmin && d.audit ? (
            <Panel title="Audit trail">
              <DataTable label="Audit trail" head={["When", "Action", "By"]} empty={d.audit.length === 0}>
                {d.audit.map((a, i) => (
                  <Row key={i}>
                    <Cell className="whitespace-nowrap">{when(a.at)}</Cell>
                    <Cell>{titleCase(a.action)}</Cell>
                    <Cell>{a.actor ?? "System"}</Cell>
                  </Row>
                ))}
              </DataTable>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Actions">
            {d.deleted_at ? (
              <p className="text-sm text-muted-foreground">
                This member deleted their account. It can still be banned if their reports call for it.
              </p>
            ) : null}
            <MemberActions
              userId={d.user_id}
              storedStatus={d.status}
              // A deleted account is only ever banned (Q54): no unhide or lifting a suspension.
              suspendedUntil={d.deleted_at ? null : d.suspended_until}
              hiddenReason={d.deleted_at ? null : d.hidden_reason}
              isAdmin={isAdmin}
            />
          </Panel>
          {isAdmin && !d.deleted_at && d.display_name ? (
            <Panel title="Correct date of birth">
              <StaffForm action={correctDobAction} label="Correct date of birth">
                <input type="hidden" name="userId" value={d.user_id} />
                <input type="date" name="dob" aria-label="Corrected date of birth" required className={controlClass} />
                <input
                  name="reason"
                  aria-label="Reason"
                  placeholder="Reason, e.g. ID checked, typo at signup"
                  required
                  minLength={5}
                  maxLength={500}
                  className={controlClass}
                />
                <StaffSubmit variant="outline">Correct date of birth</StaffSubmit>
                <p className="text-sm text-muted-foreground">
                  Only with proof of age. The new date isn’t shown here or in the audit log; the reason is.
                </p>
              </StaffForm>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

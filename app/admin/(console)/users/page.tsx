import Link from "next/link";

import { Cell, controlClass, DataTable, PageHeader, Row, titleCase } from "@/components/admin/console-ui";
import { PhoneSearch } from "@/components/admin/phone-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/staff";
import { timeAgo } from "@/lib/domain/time";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Users" };

type AccountStatus = Database["public"]["Enums"]["account_status"];
const STATUSES: AccountStatus[] = ["PENDING", "ACTIVE", "SUSPENDED", "BANNED", "DELETED"];
const VERIFICATIONS = ["NOT_STARTED", "PENDING", "VERIFIED", "REJECTED"] as const;
const STATUS_TONE = {
  ACTIVE: "approved",
  PENDING: "pending",
  SUSPENDED: "danger",
  BANNED: "danger",
  DELETED: "neutral",
} as const;

const pick = <T extends string>(list: readonly T[], v: unknown) => list.find((x) => x === v);
const yesNo = (v: unknown) => (v === "yes" ? true : v === "no" ? false : undefined);

/**
 * Spec §21 Users: search by name, ID, phone (posted, never in the URL), status, verification,
 * access (admins only, §7) and availability. Opening a member shows the account actions.
 */
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const staff = await requireStaff();
  const isAdmin = staff.role !== "MODERATOR";
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const status = pick(STATUSES, sp.status);
  const verification = pick(VERIFICATIONS, sp.verification);
  const access = isAdmin ? yesNo(sp.access) : undefined;
  const available = yesNo(sp.available);

  const { data, error } = await (
    await createClient()
  ).rpc("staff_users_search", {
    p_query: q || undefined,
    p_status: status,
    p_verification: verification,
    p_has_access: access,
    p_available: available,
    p_limit: 100,
  });
  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" subtitle="Members only · staff accounts are under Staff" />
      <div className="flex flex-col gap-3">
        <form method="get" aria-label="Search users" className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={q}
            aria-label="Name or account ID"
            placeholder="Name or account ID"
            className={`${controlClass} w-64`}
          />
          <select name="status" defaultValue={status ?? ""} aria-label="Status" className={controlClass}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
          <select
            name="verification"
            defaultValue={verification ?? ""}
            aria-label="Verification"
            className={controlClass}
          >
            <option value="">Any verification</option>
            {VERIFICATIONS.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
          {isAdmin ? (
            <select
              name="access"
              defaultValue={sp.access === "yes" || sp.access === "no" ? sp.access : ""}
              aria-label="Casual access"
              className={controlClass}
            >
              <option value="">Any access</option>
              <option value="yes">Has Casual access</option>
              <option value="no">No Casual access</option>
            </select>
          ) : null}
          <select
            name="available"
            defaultValue={sp.available === "yes" || sp.available === "no" ? sp.available : ""}
            aria-label="Availability"
            className={controlClass}
          >
            <option value="">Any availability</option>
            <option value="yes">Available now</option>
            <option value="no">Not available</option>
          </select>
          <Button type="submit" size="md">
            Search
          </Button>
        </form>
        <PhoneSearch />
      </div>
      {error ? <p role="alert">The list couldn’t load. Refresh to try again.</p> : null}
      <DataTable
        label="Members"
        head={["Member", "Status", "Verification", ...(isAdmin ? ["Access"] : []), "Available", "Joined"]}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <Row key={r.user_id}>
            <Cell>
              <Link
                href={`/admin/users/${r.user_id}`}
                className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline"
              >
                {r.display_name ?? "No profile yet"}
                {r.age ? `, ${r.age}` : ""}
              </Link>
              <div className="text-sm text-muted-foreground">{r.area ?? "—"}</div>
            </Cell>
            <Cell>
              <Badge tone={STATUS_TONE[r.effective_status]}>{r.effective_status}</Badge>
              {r.hidden ? <div className="mt-1 text-sm text-danger">Hidden</div> : null}
            </Cell>
            <Cell>{titleCase(r.verification)}</Cell>
            {isAdmin ? <Cell>{r.has_access ? "Yes" : "No"}</Cell> : null}
            <Cell>{r.in_pool ? "Yes" : "No"}</Cell>
            <Cell className="text-muted-foreground">{timeAgo(r.created_at)}</Cell>
          </Row>
        ))}
      </DataTable>
      {rows.length === 100 ? (
        <p className="text-sm text-muted-foreground">Showing the newest 100. Narrow the search to see others.</p>
      ) : null}
    </div>
  );
}

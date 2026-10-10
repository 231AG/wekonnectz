import { Cell, DataTable, FilterChip, PageHeader, Row, Stat } from "@/components/admin/console-ui";
import { requireStaff } from "@/lib/auth/staff";
import { formatUsd } from "@/lib/domain/money";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Analytics" };

const RANGES = [7, 30, 90] as const;

/** Spec §21 Analytics (§7: ADMIN): daily counts only — no member is identifiable here (§22 privacy). */
export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  await requireStaff("ADMIN");
  const sp = await searchParams;
  const days = RANGES.find((d) => String(d) === sp.days) ?? 30;
  const { data, error } = await (await createClient()).rpc("staff_analytics", { p_days: days });
  const rows = data ?? [];
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const accepted = sum("requests_accepted");
  const requests = sum("requests");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Analytics" subtitle={`Last ${days} days · Liberia time (GMT)`}>
        <nav aria-label="Range" className="flex gap-2">
          {RANGES.map((d) => (
            <FilterChip key={d} href={`/admin/analytics?days=${d}`} active={d === days}>
              {d} days
            </FilterChip>
          ))}
        </nav>
      </PageHeader>
      {error ? <p role="alert">Analytics couldn’t load. Refresh to try again.</p> : null}
      <section aria-label="Totals" className="grid max-w-5xl grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Sign-ups" value={sum("signups")} note={`${sum("verified")} verified`} testId="signups" />
        <Stat
          label="Passes sold"
          value={sum("passes_mobile_money") + sum("passes_card")}
          note={`Mobile money ${sum("passes_mobile_money")} · card ${sum("passes_card")}`}
        />
        <Stat label="Revenue" value={formatUsd(sum("revenue"))} note="Successful payments" />
        <Stat
          label="Requests"
          value={requests}
          note={
            requests
              ? `${Math.round((accepted / requests) * 100)}% accepted · ${sum("matches")} matches`
              : `${sum("matches")} matches`
          }
        />
      </section>
      <DataTable
        label="Daily figures"
        head={[
          "Day",
          "Sign-ups",
          "Verified",
          "Passes (MM / card)",
          "Revenue",
          "Likes",
          "Matches",
          "Requests",
          "Accepted",
          "Reports",
        ]}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <Row key={r.day}>
            <Cell className="whitespace-nowrap">{r.day}</Cell>
            <Cell>{r.signups}</Cell>
            <Cell>{r.verified}</Cell>
            <Cell>
              {r.passes_mobile_money} / {r.passes_card}
            </Cell>
            <Cell>{formatUsd(Number(r.revenue))}</Cell>
            <Cell>{r.likes}</Cell>
            <Cell>{r.matches}</Cell>
            <Cell>{r.requests}</Cell>
            <Cell>{r.requests_accepted}</Cell>
            <Cell>{r.reports}</Cell>
          </Row>
        ))}
      </DataTable>
    </div>
  );
}

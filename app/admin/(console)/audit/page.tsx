import Link from "next/link";

import { Cell, controlClass, DataTable, PageHeader, Row, titleCase, when } from "@/components/admin/console-ui";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/staff";
import { Constants, type Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit logs" };

type Action = Database["public"]["Enums"]["audit_action"];
const ACTIONS = Constants.public.Enums.audit_action as readonly Action[];
const PAGE = 100;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Spec §21 Audit logs: filter by actor, action, entity and date. Read-only (§7: ADMIN read, SUPER_ADMIN). */
export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaff("ADMIN");
  const sp = await searchParams;
  const actor = text(sp.actor);
  const action = ACTIONS.find((a) => a === sp.action);
  const entityType = text(sp.entity_type, 60);
  const entityId = text(sp.entity_id, 100);
  const from = typeof sp.from === "string" && DAY.test(sp.from) ? sp.from : undefined;
  const to = typeof sp.to === "string" && DAY.test(sp.to) ? sp.to : undefined;
  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? sp.before : undefined;
  const beforeId = typeof sp.before_id === "string" && /^[0-9a-f-]{36}$/i.test(sp.before_id) ? sp.before_id : undefined;

  const { data, error } = await (
    await createClient()
  ).rpc("staff_audit_logs", {
    p_actor_email: actor,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_from: from ? `${from}T00:00:00Z` : undefined,
    p_to: to ? new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString() : undefined,
    p_before: before,
    p_before_id: before ? beforeId : undefined,
    p_limit: PAGE,
  });
  const rows = data ?? [];
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ actor, action, entity_type: entityType, entity_id: entityId, from, to })) {
    if (v) next.set(k, v);
  }
  if (rows.length === PAGE) {
    next.set("before", rows[rows.length - 1].created_at);
    next.set("before_id", rows[rows.length - 1].log_id);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit logs" subtitle="Every sensitive staff action · read-only" />
      <form method="get" aria-label="Filter audit logs" className="flex flex-wrap items-center gap-3">
        <input
          name="actor"
          defaultValue={actor}
          aria-label="Staff email"
          placeholder="Staff email"
          className={`${controlClass} w-56`}
        />
        <select name="action" defaultValue={action ?? ""} aria-label="Action" className={controlClass}>
          <option value="">Any action</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {titleCase(a)}
            </option>
          ))}
        </select>
        <input
          name="entity_type"
          defaultValue={entityType}
          aria-label="Entity type"
          placeholder="Entity type, e.g. user"
          className={`${controlClass} w-48`}
        />
        <input
          name="entity_id"
          defaultValue={entityId}
          aria-label="Entity ID"
          placeholder="Entity ID"
          className={`${controlClass} w-64`}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          From
          <input type="date" name="from" defaultValue={from} className={controlClass} />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          To
          <input type="date" name="to" defaultValue={to} className={controlClass} />
        </label>
        <Button type="submit" size="md">
          Filter
        </Button>
      </form>
      {error ? <p role="alert">The log couldn’t load. Refresh to try again.</p> : null}
      <DataTable label="Audit log" head={["When", "Who", "Action", "Entity", "Details"]} empty={rows.length === 0}>
        {rows.map((r) => (
          <Row key={r.log_id}>
            <Cell className="whitespace-nowrap">{when(r.created_at)}</Cell>
            <Cell>{r.actor ?? "System"}</Cell>
            <Cell>{titleCase(r.action)}</Cell>
            <Cell>
              {r.entity_type}
              {r.entity_id ? (
                r.entity_type === "user" ? (
                  <Link
                    href={`/admin/users/${r.entity_id}`}
                    className="block font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {r.entity_id}
                  </Link>
                ) : (
                  <span className="block font-mono text-xs break-all text-muted-foreground">{r.entity_id}</span>
                )
              ) : null}
            </Cell>
            <Cell className="max-w-[420px] font-mono text-xs break-all text-muted-foreground">
              {JSON.stringify(r.metadata)}
            </Cell>
          </Row>
        ))}
      </DataTable>
      {rows.length === PAGE ? (
        <Link
          href={`/admin/audit?${next.toString()}`}
          className="inline-flex min-h-11 items-center self-start underline underline-offset-4"
        >
          Older entries
        </Link>
      ) : null}
    </div>
  );
}

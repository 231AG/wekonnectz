import {
  Cell,
  controlClass,
  DataTable,
  FilterChip,
  PageHeader,
  Panel,
  Row,
  titleCase,
  when,
} from "@/components/admin/console-ui";
import { StaffForm, StaffSubmit } from "@/components/admin/staff-form";
import { Badge } from "@/components/ui/badge";
import {
  saveAreaAction,
  saveInterestAction,
  saveMerchantAccountAction,
  savePlanAction,
  updateSettingAction,
} from "@/lib/admin/console-actions";
import { requireStaff } from "@/lib/auth/staff";
import { formatDuration, formatUsd } from "@/lib/domain/money";
import { createClient } from "@/lib/supabase/server";
import { PROVIDER_LABELS } from "@/lib/validation/payments";

export const metadata = { title: "Settings" };

const TABS = [
  ["limits", "Limits & flags"],
  ["plans", "Plans & prices"],
  ["wallets", "Merchant accounts"],
  ["interests", "Interests"],
  ["areas", "Areas"],
] as const;
type Tab = (typeof TABS)[number][0];

const check = "size-5 accent-pending";

const GROUP_LABELS: Record<string, string> = {
  account: "Accounts",
  availability: "Availability",
  card: "Card subscriptions",
  claims: "Mobile money claims",
  detection: "Detection terms",
  export: "Data export",
  geo: "Location check (feature flag)",
  messages: "Messages",
  otp: "Sign-in codes",
  photos: "Photos",
  relationship: "Relationship",
  reports: "Reports",
  requests: "Casual requests",
  staff_login: "Staff sign-in",
  subscriptions: "Subscriptions",
  verification: "Verification",
};

/**
 * Spec §21 Settings: plans and prices, merchant accounts, limits and thresholds, detection terms,
 * interests, areas and feature flags. Every change is audited (SETTING_CHANGED, old → new). Feature
 * flags and system config are SUPER_ADMIN (§7); the database enforces it.
 */
export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const staff = await requireStaff("ADMIN");
  const isSuper = staff.role === "SUPER_ADMIN";
  const sp = await searchParams;
  const tab: Tab = TABS.find(([t]) => t === sp.tab)?.[0] ?? "limits";
  const supabase = await createClient();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Every change is audit-logged with the old and new value" />
      <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
        {TABS.map(([t, label]) => (
          <FilterChip key={t} href={`/admin/settings?tab=${t}`} active={t === tab}>
            {label}
          </FilterChip>
        ))}
      </nav>
      {tab === "limits" ? <Limits supabase={supabase} isSuper={isSuper} /> : null}
      {tab === "plans" ? <Plans supabase={supabase} /> : null}
      {tab === "wallets" ? <Wallets supabase={supabase} /> : null}
      {tab === "interests" ? <Interests supabase={supabase} /> : null}
      {tab === "areas" ? <Areas supabase={supabase} /> : null}
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function Limits({ supabase, isSuper }: { supabase: Supabase; isSuper: boolean }) {
  const { data, error } = await supabase.rpc("staff_settings");
  if (error) return <p role="alert">Settings couldn’t load. Refresh to try again.</p>;
  const groups = new Map<string, NonNullable<typeof data>>();
  for (const row of data ?? []) {
    const g = row.key.split(".")[0];
    groups.set(g, [...(groups.get(g) ?? []), row]);
  }
  return (
    <div className="flex flex-col gap-6">
      {[...groups.entries()].map(([group, rows]) => (
        <Panel key={group} title={GROUP_LABELS[group] ?? titleCase(group)}>
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((s) => {
              const locked = s.super_admin_only && !isSuper;
              const unset = s.value === null;
              const current = unset
                ? ""
                : s.kind === "object" || s.kind === "array"
                  ? JSON.stringify(s.value, null, 2)
                  : String(s.value);
              return (
                <li
                  key={s.key}
                  className="grid gap-3 py-4 xl:grid-cols-[1fr_minmax(320px,420px)]"
                  data-testid={`setting-${s.key}`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-sm">{s.key}</span>
                    <span className="text-[15px] text-muted-foreground">{s.description}</span>
                    <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {unset ? <Badge tone="pending">Not set — owner decision</Badge> : null}
                      {s.super_admin_only ? <Badge>Super admin</Badge> : null}
                      {s.kind === "int" && (s.min_value != null || s.max_value != null) ? (
                        <span>
                          Allowed: {s.min_value ?? 0}–{s.max_value ?? "1,000,000"}
                        </span>
                      ) : null}
                      {s.updated_by ? (
                        <span>
                          Last changed by {s.updated_by} · {when(s.updated_at)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <StaffForm action={updateSettingAction} label={`Edit ${s.key}`}>
                    <input type="hidden" name="key" value={s.key} />
                    <input type="hidden" name="kind" value={s.kind} />
                    {s.kind === "int" ? (
                      <input
                        type="number"
                        name="value"
                        min={s.min_value ?? 0}
                        max={s.max_value ?? undefined}
                        step={1}
                        defaultValue={current}
                        aria-label={s.key}
                        disabled={locked}
                        className={controlClass}
                      />
                    ) : s.kind === "bool" ? (
                      <select
                        name="value"
                        defaultValue={current}
                        aria-label={s.key}
                        disabled={locked}
                        className={controlClass}
                      >
                        {unset ? <option value="">Choose…</option> : null}
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : s.kind === "enum" ? (
                      <select
                        name="value"
                        defaultValue={current}
                        aria-label={s.key}
                        disabled={locked}
                        className={controlClass}
                      >
                        {unset ? <option value="">Choose…</option> : null}
                        {((s.allowed as string[] | null) ?? []).map((v) => (
                          <option key={v} value={v}>
                            {titleCase(v)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        name="value"
                        defaultValue={current}
                        aria-label={s.key}
                        disabled={locked}
                        rows={Math.min(12, Math.max(3, current.split("\n").length))}
                        className={`${controlClass} py-2 font-mono text-sm`}
                      />
                    )}
                    {locked ? (
                      <p className="text-sm text-muted-foreground">Only a super admin can change this.</p>
                    ) : (
                      <StaffSubmit variant="secondary" className="self-start">
                        Save
                      </StaffSubmit>
                    )}
                  </StaffForm>
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

async function Plans({ supabase }: { supabase: Supabase }) {
  const { data, error } = await supabase.rpc("staff_plans");
  if (error) return <p role="alert">Plans couldn’t load. Refresh to try again.</p>;
  const plans = data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-[15px] text-muted-foreground">
        A price change applies to new payments only: a claim already submitted keeps its amount, and a running card
        subscription keeps the price it started with. Card plans also need the processor’s price ID.
      </p>
      {plans.map((p) => (
        <Panel key={p.plan_id} title={`${p.name} · ${titleCase(p.source)}`}>
          <p className="text-sm text-muted-foreground">
            {p.code} · {formatUsd(Number(p.price))} for {formatDuration(p.duration_hours)}
            {p.renews ? " · renews" : ""}
            {p.active ? "" : " · hidden"}
          </p>
          <PlanForm plan={p} />
        </Panel>
      ))}
      <Panel title="Add a plan">
        <PlanForm />
      </Panel>
    </div>
  );
}

type Plan = {
  plan_id: string;
  code: string;
  name: string;
  source: "MOBILE_MONEY" | "CARD";
  duration_hours: number;
  price: number;
  processor_price_id: string | null;
  active: boolean;
  sort_order: number;
};

function PlanForm({ plan }: { plan?: Plan }) {
  return (
    <StaffForm action={savePlanAction} label={plan ? `Edit ${plan.name}` : "New plan"}>
      {plan ? <input type="hidden" name="planId" value={plan.plan_id} /> : null}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {!plan ? (
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Code
            <input name="code" placeholder="MM_30DAY" className={controlClass} />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Name
          <input name="name" defaultValue={plan?.name} className={controlClass} />
        </label>
        {plan ? (
          <input type="hidden" name="source" value={plan.source} />
        ) : (
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Payment method
            <select name="source" defaultValue="MOBILE_MONEY" className={controlClass}>
              <option value="MOBILE_MONEY">Mobile money</option>
              <option value="CARD">Card</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Hours
          <input
            type="number"
            name="durationHours"
            min={1}
            defaultValue={plan?.duration_hours}
            className={controlClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Price (USD)
          <input
            type="number"
            name="price"
            min={0.01}
            step={0.01}
            defaultValue={plan?.price}
            className={controlClass}
          />
        </label>
        {!plan || plan.source === "CARD" ? (
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Processor price ID (card)
            <input name="processorPriceId" defaultValue={plan?.processor_price_id ?? ""} className={controlClass} />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Order
          <input type="number" name="sortOrder" min={0} defaultValue={plan?.sort_order ?? 0} className={controlClass} />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" name="active" defaultChecked={plan?.active ?? true} className={check} />
        Offered to members
      </label>
      <StaffSubmit variant="secondary" className="self-start">
        {plan ? "Save plan" : "Add plan"}
      </StaffSubmit>
    </StaffForm>
  );
}

async function Wallets({ supabase }: { supabase: Supabase }) {
  const { data, error } = await supabase.rpc("staff_merchant_accounts");
  if (error) return <p role="alert">Merchant accounts couldn’t load. Refresh to try again.</p>;
  const rows = (data ?? []).filter((a) => a.provider !== "CARD");
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-[15px] text-muted-foreground">
        Members pay into the active wallet for each provider. Making a wallet active retires the previous one; claims
        already submitted keep the wallet they paid into.
      </p>
      {rows.map((a) => (
        <Panel
          key={a.account_id}
          title={`${PROVIDER_LABELS[a.provider as "ORANGE_MONEY" | "MTN_MOMO"]} · ${a.display_name}`}
        >
          <WalletForm wallet={a} />
        </Panel>
      ))}
      <Panel title="Add a wallet">
        <WalletForm />
      </Panel>
    </div>
  );
}

function WalletForm({
  wallet,
}: {
  wallet?: { account_id: string; provider: string; display_name: string; number_or_code: string; active: boolean };
}) {
  return (
    <StaffForm action={saveMerchantAccountAction} label={wallet ? `Edit wallet ${wallet.display_name}` : "New wallet"}>
      {wallet ? <input type="hidden" name="accountId" value={wallet.account_id} /> : null}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {wallet ? (
          <input type="hidden" name="provider" value={wallet.provider} />
        ) : (
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Provider
            <select name="provider" defaultValue="ORANGE_MONEY" className={controlClass}>
              <option value="ORANGE_MONEY">{PROVIDER_LABELS.ORANGE_MONEY}</option>
              <option value="MTN_MOMO">{PROVIDER_LABELS.MTN_MOMO}</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Account name members see
          <input name="displayName" defaultValue={wallet?.display_name} className={controlClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Number or merchant code
          <input name="numberOrCode" defaultValue={wallet?.number_or_code} className={controlClass} />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" name="active" defaultChecked={wallet?.active ?? true} className={check} />
        Active (members pay into this wallet)
      </label>
      <StaffSubmit variant="secondary" className="self-start">
        {wallet ? "Save wallet" : "Add wallet"}
      </StaffSubmit>
    </StaffForm>
  );
}

async function Interests({ supabase }: { supabase: Supabase }) {
  const { data, error } = await supabase.rpc("staff_interests");
  if (error) return <p role="alert">Interests couldn’t load. Refresh to try again.</p>;
  const rows = data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Add an interest">
        <StaffForm action={saveInterestAction} label="New interest">
          <div className="flex flex-wrap gap-3">
            <input name="name" aria-label="Interest name" placeholder="Name" className={`${controlClass} w-64`} />
            <input type="hidden" name="active" value="on" />
            <StaffSubmit variant="secondary">Add interest</StaffSubmit>
          </div>
        </StaffForm>
      </Panel>
      <DataTable label="Interests" head={["Interest"]} empty={rows.length === 0}>
        {rows.map((i) => (
          <Row key={i.interest_id}>
            <Cell>
              <StaffForm
                action={saveInterestAction}
                label={`Edit ${i.name}`}
                className="flex-row flex-wrap items-center"
              >
                <input type="hidden" name="interestId" value={i.interest_id} />
                <input
                  name="name"
                  defaultValue={i.name}
                  aria-label="Interest name"
                  className={`${controlClass} w-64`}
                />
                <label className="flex min-h-11 items-center gap-3 text-[15px]">
                  <input type="checkbox" name="active" defaultChecked={i.active} className={check} />
                  Shown
                </label>
                <StaffSubmit variant="outline">Save</StaffSubmit>
              </StaffForm>
            </Cell>
          </Row>
        ))}
      </DataTable>
    </div>
  );
}

async function Areas({ supabase }: { supabase: Supabase }) {
  const { data, error } = await supabase.rpc("staff_areas");
  if (error) return <p role="alert">Areas couldn’t load. Refresh to try again.</p>;
  const rows = data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Add an area">
        <StaffForm action={saveAreaAction} label="New area">
          <div className="flex flex-wrap gap-3">
            <input name="county" aria-label="County" placeholder="County" className={`${controlClass} w-56`} />
            <input name="name" aria-label="Community" placeholder="Community" className={`${controlClass} w-64`} />
            <input type="hidden" name="active" value="on" />
            <StaffSubmit variant="secondary">Add area</StaffSubmit>
          </div>
        </StaffForm>
      </Panel>
      <DataTable label="Areas" head={["Area"]} empty={rows.length === 0}>
        {rows.map((a) => (
          <Row key={a.area_id}>
            <Cell>
              <StaffForm action={saveAreaAction} label={`Edit ${a.name}`} className="flex-row flex-wrap items-center">
                <input type="hidden" name="areaId" value={a.area_id} />
                <input name="county" defaultValue={a.county} aria-label="County" className={`${controlClass} w-56`} />
                <input name="name" defaultValue={a.name} aria-label="Community" className={`${controlClass} w-64`} />
                <label className="flex min-h-11 items-center gap-3 text-[15px]">
                  <input type="checkbox" name="active" defaultChecked={a.active} className={check} />
                  Shown
                </label>
                <StaffSubmit variant="outline">Save</StaffSubmit>
              </StaffForm>
            </Cell>
          </Row>
        ))}
      </DataTable>
    </div>
  );
}

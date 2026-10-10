import Link from "next/link";

import { cn } from "@/lib/utils";

/** Shared layout pieces for the admin console tables and filters (admin mock-ups 01–03). */

export const controlClass =
  "min-h-11 rounded-control border-[1.5px] border-border bg-background px-3 text-[15px] disabled:cursor-not-allowed disabled:opacity-60";

function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[34px] font-bold">{title}</h1>
        {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[15px] font-semibold hover:bg-surface-2",
        active && "bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}

function DataTable({
  head,
  children,
  empty,
  label,
}: {
  head: string[];
  children: React.ReactNode;
  empty?: boolean;
  label: string;
}) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-card border border-border bg-surface-1">
      <table className="w-full text-left text-[15px]" aria-label={label}>
        <thead className="border-b border-border text-sm text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-6 text-muted-foreground">
                Nothing here.
              </td>
            </tr>
          ) : null}
          {children}
        </tbody>
      </table>
    </div>
  );
}

function Row({ children, selected }: { children: React.ReactNode; selected?: boolean }) {
  return <tr className={cn("border-b border-border last:border-0", selected && "bg-surface-2")}>{children}</tr>;
}

function Cell({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top", className)}>{children}</td>;
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section
      aria-label={title}
      className={cn("flex flex-col gap-4 rounded-card border border-border bg-surface-1 p-5", className)}
    >
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface-1 p-5">
      <span className="text-sm font-semibold text-muted-foreground">{label}</span>
      <span className="font-display text-[32px] font-bold" data-testid={testId}>
        {value}
      </span>
      {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
    </div>
  );
}

/** Liberia time (GMT), compact, for staff tables. */
function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Monrovia",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(" ");

export { Cell, DataTable, FilterChip, PageHeader, Panel, Row, Stat, titleCase, when };

import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/relationship", label: "Discover" },
  { href: "/relationship/likes", label: "Likes" },
  { href: "/relationship/matches", label: "Matches" },
] as const;

/** Relationship sections (spec §20: Discover · Likes received · Matches). */
function RelationshipTabs({
  active,
  counts,
}: {
  active: (typeof TABS)[number]["href"];
  counts?: Record<string, number>;
}) {
  return (
    <nav aria-label="Relationship" className="grid grid-cols-3 rounded-2xl border border-border bg-surface-1 p-1">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center justify-center rounded-xl text-[15px] font-bold",
            active === t.href ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {counts?.[t.href] ? ` · ${counts[t.href]}` : ""}
        </Link>
      ))}
    </nav>
  );
}

export { RelationshipTabs };

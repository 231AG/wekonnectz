import Link from "next/link";

import { cn } from "@/lib/utils";

/** Messages sections (member mock-up 05): Chats · Requests. */
function MessagesTabs({ active, requests }: { active: "chats" | "requests"; requests: number }) {
  const tabs = [
    { key: "chats", href: "/messages", label: "Chats" },
    { key: "requests", href: "/messages/requests", label: requests ? `Requests · ${requests}` : "Requests" },
  ] as const;
  return (
    <nav aria-label="Messages" className="grid grid-cols-2 rounded-2xl border border-border bg-surface-1 p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center justify-center rounded-xl text-[15px] font-bold",
            active === t.key ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export { MessagesTabs };

import Link from "next/link";
import { Bell } from "lucide-react";

/** The Home header bell (mock-up member/01), with the unread count. */
function BellLink({ unread }: { unread: number }) {
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative flex size-11 items-center justify-center rounded-full border border-border bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Bell className="size-5" strokeWidth={1.8} aria-hidden />
      {unread ? (
        <span
          className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-gradient px-1 text-[11px] font-bold text-primary-foreground"
          data-testid="unread-count"
          aria-hidden
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

export { BellLink };

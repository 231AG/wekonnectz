import Link from "next/link";
import { after } from "next/server";
import { Bell, CalendarClock, ChevronRight, Heart, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { MemberShell } from "@/components/layout/member-shell";
import { Card } from "@/components/ui/card";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { describeNotification, type NotificationTone } from "@/lib/domain/notifications";
import { timeAgo } from "@/lib/domain/time";
import { markNotificationsRead, memberNotifications } from "@/lib/notifications/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

const TONE: Record<NotificationTone, { icon: typeof Bell; className: string }> = {
  casual: { icon: Sparkles, className: "text-casual" },
  relationship: { icon: Heart, className: "text-relationship" },
  account: { icon: ShieldCheck, className: "text-verified" },
  warning: { icon: CalendarClock, className: "text-pending" },
};

/** Notifications (spec §20). Newest first; opening the screen reads them all. */
export default async function NotificationsPage() {
  const member = await requireMember();
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  const items = await memberNotifications(member.id);
  // Read once the page has been sent, so this visit still shows which ones were new.
  if (items.some((n) => !n.read)) after(() => markNotificationsRead(member.id));
  return (
    <MemberShell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[34px] font-bold">Notifications</h1>
        <Link
          href="/account/notifications"
          className="inline-flex min-h-11 items-center text-sm font-bold text-pending underline underline-offset-4"
        >
          Settings
        </Link>
      </div>
      {items.length === 0 ? (
        <Card
          tone="dashed"
          className="flex flex-col items-center gap-2 py-10 text-center"
          data-testid="notifications-empty"
        >
          <Bell className="size-8 text-muted-foreground" strokeWidth={1.6} aria-hidden />
          <p className="font-bold">Nothing yet</p>
          <p className="text-[15px] text-muted-foreground">Requests, matches and messages will show up here.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label="Notifications">
          {items.map((n) => {
            const t = describeNotification(n.type, n.payload);
            const { icon: Icon, className } =
              n.type === "MESSAGE_RECEIVED" ? { icon: MessageCircle, className: "text-relationship" } : TONE[t.tone];
            return (
              <li key={n.id}>
                <Link
                  href={t.href}
                  className="rounded-card focus-visible:outline-2 focus-visible:outline-ring"
                  data-testid="notification"
                >
                  <Card
                    className={cn(
                      "flex items-start gap-3.5 hover:bg-surface-2",
                      !n.read && "border-pending/40 bg-surface-2",
                    )}
                  >
                    <Icon className={cn("mt-0.5 size-6 shrink-0", className)} strokeWidth={1.8} aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 font-bold">
                        {t.title}
                        {!n.read ? (
                          <span className="size-2 rounded-full bg-pending" aria-label="New" role="img" />
                        ) : null}
                      </span>
                      <span className="text-[15px] text-muted-foreground">{t.body}</span>
                      <span className="text-[13px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </span>
                    <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </MemberShell>
  );
}

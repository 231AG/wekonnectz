import { BackLink } from "@/components/account/back-link";
import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { PrefsForm } from "@/components/notifications/prefs-form";
import { PushToggle } from "@/components/notifications/push-toggle";
import { requireMember } from "@/lib/auth/session";
import { vapidPublicKey } from "@/lib/env.public";
import { pushConfigured } from "@/lib/notifications/push";
import { notificationPrefs } from "@/lib/notifications/server";

export const metadata = { title: "Notification settings" };

/** Notification settings (spec §18 notification prefs; OD-25 in-app + web push). */
export default async function NotificationSettingsPage() {
  const member = await requireMember();
  const prefs = await notificationPrefs(member.id);
  const publicKey = pushConfigured() ? vapidPublicKey() : null;
  return (
    <MobileScreen>
      <BackLink href="/account/settings" />
      <ScreenTitle>Notifications</ScreenTitle>
      <ScreenLead>Choose what we tell you about. Notices never show names or what anyone wrote.</ScreenLead>
      <section
        aria-labelledby="phone"
        className="flex flex-col gap-2.5 rounded-card border border-border bg-surface-1 p-[18px]"
      >
        <h2 id="phone" className="text-[15px] font-bold">
          On this phone
        </h2>
        {publicKey ? (
          <PushToggle publicKey={publicKey} />
        ) : (
          <p className="text-[15px] text-muted-foreground" data-testid="push-unavailable">
            Phone notifications aren’t available yet. You’ll still see everything under the bell on Home.
          </p>
        )}
      </section>
      <PrefsForm prefs={prefs} />
    </MobileScreen>
  );
}

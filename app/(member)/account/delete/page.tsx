import { BackLink } from "@/components/account/back-link";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/lib/auth/session";

export const metadata = { title: "Delete account" };

/** Delete account (spec §8): hidden from everyone at once; data purged after the retention period (OD-7). */
export default async function DeleteAccountPage() {
  await requireMember();
  return (
    <MobileScreen>
      <BackLink href="/account/settings" />
      <ScreenTitle>Delete your account</ScreenTitle>
      <ScreenLead>This can’t be undone.</ScreenLead>
      <Card className="flex flex-col gap-2 text-[15px]">
        <p className="font-bold">What happens</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
          <li>Your profile disappears from everywhere straight away, and you’re logged out.</li>
          <li>Your matches, chats and requests end. Other members aren’t told why.</li>
          <li>A card plan is cancelled so it won’t renew.</li>
          <li>
            After a retention period your photos, selfie and profile are permanently deleted. Payment records are kept.
          </li>
        </ul>
        <p className="text-muted-foreground">
          Want a copy first?{" "}
          <a
            href="/api/me/export"
            download
            className="inline-flex min-h-11 items-center font-bold text-pending underline"
          >
            Download my data
          </a>
        </p>
      </Card>
      <DeleteAccountForm />
    </MobileScreen>
  );
}

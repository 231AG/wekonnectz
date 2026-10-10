import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, CircleCheck, Clock, Image as ImageIcon } from "lucide-react";

import { MobileScreen } from "@/components/layout/mobile-screen";
import { EditWhileWaiting, ReviewAutoRefresh } from "@/components/onboarding/review-live";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions/login";
import { MEMBER_HOME, requireOnboardingStep } from "@/lib/auth/session";
import { maskPhone } from "@/lib/domain/phone";
import { reviewStatus } from "@/lib/storage/verification";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "We’re reviewing your profile" };

type Tone = "approved" | "pending" | "danger";

function StatusRow({
  icon,
  title,
  detail,
  badge,
  tone,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  badge: string;
  tone: Tone;
  href?: string;
}) {
  const body = (
    <Card className="flex items-center gap-4">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-bold">{title}</p>
        <p className="text-[15px] text-muted-foreground">{detail}</p>
      </div>
      <Badge tone={tone}>{badge}</Badge>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Spec §10 step 11 (mock-up 08): live progress of photos and verification while a person reviews. */
export default async function UnderReviewPage() {
  const member = await requireOnboardingStep("review");
  // The last approval can land while this screen is open (it refreshes itself): go live.
  if (member.status === "ACTIVE" || member.status === "SUSPENDED") redirect(MEMBER_HOME);
  const [status, { data: auth }] = await Promise.all([reviewStatus(member.id), (await createClient()).auth.getUser()]);
  const phone = auth.user?.phone ? maskPhone(`+${auth.user.phone.replace(/^\+/, "")}`) : "";

  const photosDetail = [
    `${status.photosApproved} approved`,
    status.photosInReview ? `${status.photosInReview} in review` : "",
    status.photosRejected ? `${status.photosRejected} not approved` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const photosDone = status.photosApproved >= status.photosRequired;
  // Enough photos approved or still in review: nothing for the member to do, even if one was rejected.
  const photosEnough = status.photosApproved + status.photosInReview >= status.photosRequired;

  return (
    <MobileScreen
      footer={
        <>
          <EditWhileWaiting />
          <Button asChild variant="ghost" size="md" className="w-full">
            <Link href="/account/settings">Account settings</Link>
          </Button>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="md" className="w-full">
              Log out
            </Button>
          </form>
        </>
      }
    >
      <ReviewAutoRefresh />
      <div className="mt-10 flex flex-col items-center gap-4 text-center">
        <div className="flex size-[76px] items-center justify-center rounded-full bg-pending/15">
          <Clock className="size-9 text-pending" strokeWidth={1.8} aria-hidden />
        </div>
        <h1 className="font-display text-[28px] leading-[33px] font-bold">We’re reviewing your profile</h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          A real person checks every profile before it goes live. Usually done within 24 hours.
        </p>
      </div>
      <div className="mt-2 flex flex-col gap-3" aria-live="polite">
        <StatusRow
          icon={<CircleCheck className="size-6 shrink-0 text-success" strokeWidth={1.8} aria-hidden />}
          title="Phone verified"
          detail={phone}
          badge="Done"
          tone="approved"
        />
        <StatusRow
          icon={<ImageIcon className="size-6 shrink-0 text-pending" strokeWidth={1.8} aria-hidden />}
          title="Photos"
          detail={photosDetail}
          badge={photosDone ? "Done" : photosEnough ? "In review" : "Action needed"}
          tone={photosDone ? "approved" : photosEnough ? "pending" : "danger"}
          href={photosEnough ? undefined : "/onboarding/photos"}
        />
        <StatusRow
          icon={<Camera className="size-6 shrink-0 text-pending" strokeWidth={1.8} aria-hidden />}
          title="Verification selfie"
          detail={status.verification === "VERIFIED" ? "Approved" : "Submitted"}
          badge={status.verification === "VERIFIED" ? "Done" : "In review"}
          tone={status.verification === "VERIFIED" ? "approved" : "pending"}
        />
      </div>
    </MobileScreen>
  );
}

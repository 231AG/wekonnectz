import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PhoneOtpForm } from "@/components/auth/phone-otp-form";
import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { loginPhoneStep } from "@/lib/auth/actions/login";
import { getMember, nextStepFor } from "@/lib/auth/session";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const member = await getMember();
  if (member) redirect(nextStepFor(member));
  const { notice } = await searchParams;

  return (
    <MobileScreen>
      <div className="flex min-h-11 items-center">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link href="/">
            <ArrowLeft className="size-5" strokeWidth={1.8} />
          </Link>
        </Button>
      </div>
      <ScreenTitle>Welcome back</ScreenTitle>
      <ScreenLead>Enter the Liberian number you signed up with. We’ll text you a 6-digit code.</ScreenLead>
      {notice === "unavailable" ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          This account isn’t available.
        </p>
      ) : null}
      <PhoneOtpForm action={loginPhoneStep} />
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="inline-flex min-h-11 items-center font-bold text-pending underline">
          Create account
        </Link>
      </p>
    </MobileScreen>
  );
}

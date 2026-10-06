import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { InterestsForm } from "@/components/onboarding/interests-form";
import { StepHeader } from "@/components/ui/step-header";
import { requireOnboardingStep } from "@/lib/auth/session";
import { saveInterestsBio } from "@/lib/onboarding/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Interests and bio" };

/** Spec §10 steps 7–8. No mock-up exists for this screen; it follows the onboarding layout. */
export default async function InterestsStepPage() {
  const member = await requireOnboardingStep("interests");
  const supabase = await createClient();
  const [{ data: interests }, { data: mine }, { data: profile }] = await Promise.all([
    supabase.from("interests").select("id, name").order("name"),
    supabase.from("user_interests").select("interest_id").eq("user_id", member.id),
    supabase.from("profiles").select("bio").eq("user_id", member.id).single(),
  ]);

  return (
    <MobileScreen>
      <StepHeader step={5} total={8} backHref="/onboarding/about" />
      <ScreenTitle>What you’re into</ScreenTitle>
      <ScreenLead>Interests help people find things in common. Your bio is optional.</ScreenLead>
      <InterestsForm
        action={saveInterestsBio}
        interests={interests ?? []}
        defaults={{ interestIds: (mine ?? []).map((r) => r.interest_id), bio: profile?.bio ?? "" }}
      />
    </MobileScreen>
  );
}

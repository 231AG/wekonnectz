import { MobileScreen, ScreenTitle } from "@/components/layout/mobile-screen";
import { AboutForm } from "@/components/onboarding/about-form";
import { StepHeader } from "@/components/ui/step-header";
import { requireOnboardingStep } from "@/lib/auth/session";
import { saveBasics } from "@/lib/onboarding/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "About you" };

/** Spec §10 steps 5–6 (mock-up: onboarding 05). Re-opening the step edits the saved answers. */
export default async function AboutStepPage() {
  const member = await requireOnboardingStep("about");
  const supabase = await createClient();
  const [{ data: areas }, { data: profile }] = await Promise.all([
    supabase.from("areas").select("id, county, name").order("county").order("name"),
    supabase
      .from("profiles")
      .select("display_name, gender, seeking_genders, area_id, intent_relationship, intent_casual")
      .eq("user_id", member.id)
      .single(),
  ]);

  const intent =
    profile?.intent_relationship && profile.intent_casual
      ? "BOTH"
      : profile?.intent_relationship
        ? "RELATIONSHIP"
        : profile?.intent_casual
          ? "CASUAL"
          : "";

  return (
    <MobileScreen>
      <StepHeader step={4} total={8} backHref="/onboarding/rules" />
      <ScreenTitle>About you</ScreenTitle>
      <AboutForm
        action={saveBasics}
        areas={areas ?? []}
        defaults={{
          displayName: profile?.display_name ?? "",
          gender: profile?.gender ?? "",
          seeking: profile?.seeking_genders ?? [],
          areaId: profile?.area_id ?? "",
          intent,
        }}
      />
    </MobileScreen>
  );
}

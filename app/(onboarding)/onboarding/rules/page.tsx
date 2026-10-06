import { MobileScreen, ScreenTitle } from "@/components/layout/mobile-screen";
import { RulesForm } from "@/components/onboarding/rules-form";
import { StepHeader } from "@/components/ui/step-header";
import { requireOnboardingStep } from "@/lib/auth/session";
import { acceptRules } from "@/lib/onboarding/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Community rules" };

/** Spec §10 step 4. The member accepts the versions shown here; the database checks they are current. */
export default async function RulesStepPage() {
  await requireOnboardingStep("rules");
  const supabase = await createClient();
  const { data: docs } = await supabase.from("legal_documents").select("document, version").eq("is_current", true);
  const versions = Object.fromEntries((docs ?? []).map((d) => [d.document, d.version])) as Record<
    "RULES" | "TERMS" | "PRIVACY",
    string
  >;
  const ready = Boolean(versions.RULES && versions.TERMS && versions.PRIVACY);

  return (
    <MobileScreen>
      <StepHeader step={3} total={8} />
      <ScreenTitle>Community rules</ScreenTitle>
      {ready ? (
        <RulesForm action={acceptRules} versions={versions} />
      ) : (
        <p role="alert" className="text-danger">
          The rules aren’t published yet. Please try again later.
        </p>
      )}
    </MobileScreen>
  );
}

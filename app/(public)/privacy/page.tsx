import { InfoPage } from "@/components/public/info-page";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy policy" draft>
      <p>
        The Privacy policy will be published here after Liberian legal review. Until then this page is a placeholder.
      </p>
      <p>
        What we already do: we never collect your precise location, your verification selfie is seen only by reviewers,
        and phone numbers are stored only in protected form.
      </p>
    </InfoPage>
  );
}

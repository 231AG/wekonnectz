import { InfoPage } from "@/components/public/info-page";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <InfoPage title="Terms of use" draft>
      <p>
        The Terms of use will be published here after Liberian legal review. Until then this page is a placeholder and
        does not form an agreement.
      </p>
    </InfoPage>
  );
}

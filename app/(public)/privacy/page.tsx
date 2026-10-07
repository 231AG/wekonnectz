import { InfoPage } from "@/components/public/info-page";
import { LegalDocumentBody } from "@/components/public/legal-document";
import { getCurrentDocument } from "@/lib/content/legal";

export const metadata = { title: "Privacy policy" };

/** Rendered from the current published version, so it matches what members accept (§10 step 4). */
export default async function Page() {
  const doc = await getCurrentDocument("PRIVACY");
  if (!doc) {
    return (
      <InfoPage title="Privacy policy">
        <p>This page will be published soon.</p>
      </InfoPage>
    );
  }
  return (
    <InfoPage title={doc.title} draft={doc.version.startsWith("draft")} version={doc.version}>
      <LegalDocumentBody body={doc.body} />
    </InfoPage>
  );
}

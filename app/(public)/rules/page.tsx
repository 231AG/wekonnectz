import { InfoPage } from "@/components/public/info-page";

export const metadata = { title: "Community rules" };

/** Community rules (spec §2 Prohibited use, §10 step 4). Final wording follows legal review (T-12). */
export default function RulesPage() {
  return (
    <InfoPage title="Community rules" draft>
      <h2>No selling or buying sex</h2>
      <p>
        Offering or asking for sex in exchange for money, airtime, mobile money, gifts, transport fare or anything else
        gets you removed.
      </p>
      <h2>Adults only</h2>
      <p>Everyone here is 18 or older. Report anyone who looks younger. No content showing anyone under 18.</p>
      <h2>No contact details or prices</h2>
      <p>Keep phone numbers, WhatsApp or social handles, links and prices out of your bio and first messages.</p>
      <h2>Never ask for money</h2>
      <p>Don’t request or send money to members, for any reason.</p>
      <h2>Be yourself</h2>
      <p>No fake profiles, impersonation, other people’s photos, nudity or sexually explicit photos.</p>
    </InfoPage>
  );
}

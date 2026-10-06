import { InfoPage } from "@/components/public/info-page";

export const metadata = { title: "Safety" };

/** Member-facing safety (spec §17). */
export default function SafetyPage() {
  return (
    <InfoPage title="Staying safe">
      <ul className="flex flex-col gap-2">
        <li>
          <strong>Meet in public places</strong> for the first few times.
        </li>
        <li>
          <strong>Tell a friend</strong> where you are going and who you are meeting.
        </li>
        <li>
          <strong>Arrange your own transport</strong> there and back.
        </li>
        <li>
          <strong>Never send money</strong> to someone you met here — not for transport, airtime, emergencies or
          anything else.
        </li>
      </ul>
      <h2>Report and block</h2>
      <p>
        You can report or block anyone from their profile or your conversation in two taps. Blocking is silent: they are
        not told. Reports of anyone who looks under 18 remove them from discovery immediately while we review.
      </p>
    </InfoPage>
  );
}

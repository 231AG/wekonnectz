import { InfoPage } from "@/components/public/info-page";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <InfoPage title="About WeKonnectz">
      <p>
        WeKonnectz is an adults-only (18+) place for people in Liberia to meet. One account, one profile and one
        verification give you two ways to connect.
      </p>
      <h2>Relationship — free</h2>
      <p>See one profile at a time. Like or pass. When you both like each other, you can chat.</p>
      <h2>Casual Connection — with a pass</h2>
      <p>
        See who is available now and send a message request. They choose whether to accept. A pass gives access to the
        pool and messaging tools. It never buys a person, a meeting or any outcome.
      </p>
      <h2>Everyone is verified</h2>
      <p>
        Every member confirms a Liberian phone number and takes a private verification selfie that a real person reviews
        before the profile goes live.
      </p>
    </InfoPage>
  );
}

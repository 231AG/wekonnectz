import { InfoPage } from "@/components/public/info-page";
import { formatDuration, formatUsd } from "@/lib/domain/money";
import { publicPlans } from "@/lib/storage/payments";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

/** Pricing (spec §20). Relationship is free; Casual needs a pass. Plans come from the database. */
export default async function PricingPage() {
  const plans = (await publicPlans()).filter((p) => p.source === "MOBILE_MONEY");
  return (
    <InfoPage title="Pricing">
      <h2>Relationship — free</h2>
      <p>Discover verified members, like, match and chat. No payment needed.</p>
      <h2>Casual Connection — a pass</h2>
      <p>
        A pass unlocks the Available Now pool and message requests. Pay with Orange Money or MTN MoMo; a person checks
        every payment before the pass starts. One-time purchase, no auto-renew.
      </p>
      <ul>
        {plans.map((p) => (
          <li key={p.code}>
            <strong>{p.name}</strong> — {formatDuration(p.duration_hours)} — {formatUsd(p.price)}
          </li>
        ))}
      </ul>
    </InfoPage>
  );
}

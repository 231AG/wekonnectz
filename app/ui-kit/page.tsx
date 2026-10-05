import { Flame, Heart, Lock, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Pill, PillRadioGroup } from "@/components/ui/pill";
import { StepHeader } from "@/components/ui/step-header";
import { assertUiKitEnabled } from "@/lib/dev/ui-kit";

export const metadata = { title: "UI kit" };

const SWATCHES: { name: string; mockup?: string; value: string }[] = [
  { name: "Background", value: "#0D0D11" },
  { name: "Surface 1", value: "#17171D" },
  { name: "Surface 2", value: "#202028" },
  { name: "Border", value: "#30303B" },
  { name: "Text", value: "#F3F1EC" },
  { name: "Muted", value: "#A9A7B2" },
  { name: "Primary", mockup: "#E3C28E", value: "#FF9A03 → #F9315F" },
  { name: "Relationship", mockup: "#8EB0FF", value: "#C78BFF" },
  { name: "Casual", mockup: "#F2945C", value: "#FFA24C" },
  { name: "Verified", value: "#8EB0FF" },
  { name: "Pending", value: "#E3C28E" },
  { name: "Success", value: "#6FCF97" },
  { name: "Danger", value: "#FF8A7E" },
];

function swatchStyle(value: string) {
  const [from, to] = value.split(" → ");
  return { background: to ? `linear-gradient(90deg, ${from}, ${to})` : from };
}

export default async function UiKitPage() {
  await assertUiKitEnabled();
  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col">
      <main className="flex flex-1 flex-col gap-8 px-5 py-6">
        <StepHeader step={1} total={8} backHref="/ui-kit" />
        <section className="flex flex-col items-center gap-2">
          <Logo className="w-56" priority />
          <h1 className="font-display text-[28px] leading-[33px] font-bold">UI kit · tokens v1</h1>
          <p className="text-center text-[15px] leading-[22px] text-muted-foreground">
            Mock-up neutrals and type, accents taken from the logo. Proposal for owner sign-off.
          </p>
        </section>

        <section aria-labelledby="colours" className="flex flex-col gap-3">
          <h2 id="colours" className="font-display text-lg font-bold">
            Colours
          </h2>
          <ul className="grid grid-cols-2 gap-3">
            {SWATCHES.map((s) => (
              <li key={s.name} className="flex items-center gap-3">
                <span className="size-9 shrink-0 rounded-lg border border-border" style={swatchStyle(s.value)} />
                <span className="text-xs leading-4">
                  <span className="block font-bold">{s.name}</span>
                  <span className="text-muted-foreground">{s.value}</span>
                  {s.mockup ? <span className="block text-muted-foreground line-through">{s.mockup}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="buttons" className="flex flex-col gap-3">
          <h2 id="buttons" className="font-display text-lg font-bold">
            Buttons
          </h2>
          <Button>Continue</Button>
          <Button variant="outline">Log in</Button>
          <Button variant="casual">Send a request</Button>
          <div className="flex gap-3">
            <Button variant="casual" size="md" className="flex-1">
              Accept
            </Button>
            <Button variant="outline" size="md" className="flex-1">
              Decline
            </Button>
            <Button variant="danger" size="md">
              Ban
            </Button>
          </div>
          <div className="flex items-center justify-center gap-6">
            <Button variant="secondary" size="icon-lg" aria-label="Pass">
              <span aria-hidden className="text-2xl">
                ✕
              </span>
            </Button>
            <Button variant="relationship" size="icon-lg" aria-label="Like">
              <Heart className="size-7" strokeWidth={1.8} />
            </Button>
          </div>
        </section>

        <section aria-labelledby="inputs" className="flex flex-col gap-3">
          <h2 id="inputs" className="font-display text-lg font-bold">
            Inputs and choices
          </h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kit-name">Display name</Label>
            <Input id="kit-name" defaultValue="Musu" />
          </div>
          <PillRadioGroup
            aria-label="I am"
            defaultValue="woman"
            options={[
              { value: "woman", label: "Woman" },
              { value: "man", label: "Man" },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Pill selected tone="casual">
              Tonight
            </Pill>
          </div>
        </section>

        <section aria-labelledby="badges" className="flex flex-col gap-3">
          <h2 id="badges" className="font-display text-lg font-bold">
            Badges and cards
          </h2>
          <div className="flex flex-wrap gap-2">
            <Badge tone="approved">Approved</Badge>
            <Badge tone="pending">In review</Badge>
            <Badge tone="relationship">Free</Badge>
            <Badge tone="casual">Pass active</Badge>
            <Badge tone="danger">High</Badge>
          </div>
          <Card tone="relationship" className="flex items-center gap-3">
            <Heart className="size-6 text-relationship" strokeWidth={1.8} aria-hidden />
            <span className="font-display text-xl font-bold">Relationship</span>
          </Card>
          <Card tone="casual" className="flex items-center gap-3">
            <Flame className="size-6 text-casual" strokeWidth={1.8} aria-hidden />
            <span className="font-display text-xl font-bold">Casual Connection</span>
          </Card>
          <Card className="flex gap-3">
            <Lock className="size-[18px] shrink-0 text-pending" strokeWidth={1.8} aria-hidden />
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              Your date of birth can’t be changed later. Only your age is shown on your profile.
            </p>
          </Card>
          <Card tone="dashed" className="flex gap-3">
            <ShieldCheck className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            <p className="text-[15px] text-muted-foreground">Never send money to someone you haven’t met.</p>
          </Card>
        </section>
      </main>
      <div className="sticky bottom-0" data-sticky-nav>
        <BottomNav activeHref="/home" />
      </div>
    </div>
  );
}

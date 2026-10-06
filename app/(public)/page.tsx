import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getMember, nextStepFor } from "@/lib/auth/session";

/** Welcome (spec §10 step 1, mock-up: onboarding 01). Public and global (§3 rule 9). */
export default async function WelcomePage() {
  const member = await getMember();
  if (member) redirect(nextStepFor(member));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pt-10 pb-6">
      <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <Logo priority className="w-60" />
        <h1 className="font-display text-[38px] leading-[1.1] font-bold">Meet with intention.</h1>
        <p className="text-[17px] leading-[25px] text-muted-foreground">
          Verified adults in Liberia. Something serious or something easy — on your terms.
        </p>
      </main>
      <div className="mt-8 flex flex-col gap-3">
        <Button asChild>
          <Link href="/signup">Create account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
        <p className="mt-2 text-center text-[13px] text-muted-foreground">18+ only · Available in Liberia only</p>
        <nav aria-label="Information" className="flex flex-wrap justify-center gap-x-1 text-[13px]">
          {[
            ["/about", "About"],
            ["/safety", "Safety"],
            ["/rules", "Community rules"],
            ["/terms", "Terms"],
            ["/privacy", "Privacy"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center px-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
